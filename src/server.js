const Koa = require('koa');
const bodyParser = require('koa-bodyparser');
const Router = require('@koa/router');
const Redis = require('ioredis');
const assert = require('assert');
const fetch = require('node-fetch');
const { URLSearchParams } = require('url');
const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');

// import Client, { AppsJscode2sessionRequest } from '@open-dy/open_api_sdk';
// const AppsJscode2sessionRequest = require('@open-dy/open_api_sdk');
// const CredentialClient = require('@open-dy/open_api_credential');

// const {apiLogin} = require('./login')
const APPID = 'tt67291194f948177e02';
const SECRET = 'da8c2a6e39ac3ddb885a430ed77ef8deb6cb3889';
const PORT = 8008;
// 初始化各服务的连接 redis
const { REDIS_ADDRESS, REDIS_USERNAME, REDIS_PASSWORD } = { REDIS_ADDRESS: "localhost:6379", REDIS_USERNAME: "yubiao", REDIS_PASSWORD: "zyb151" };
console.log(REDIS_ADDRESS);
const [REDIS_HOST, REDIS_PORT] = REDIS_ADDRESS.split(':');
const redis = new Redis({
    port: parseInt(REDIS_PORT, 10),
    host: REDIS_HOST,
    // username: REDIS_USERNAME,
    password: REDIS_PASSWORD,
    db: 0,
});

// assert(redis.echo('echo') === 'echo', `redis echo error`);

let players = new Map(); // openid -> [win, lose, draw]
let wss = new Map(); // openid -> ws
let rooms = new Map(); // roomId -> [red, black]
let waiting = [] // [openid, openid, ...]
let gameAgainList = new Map(); // roomId -> 2, 一方发起gameAgain就减1,为0重刷棋盘
let roomId = 0
let debugOpenid = 0
// WebSocket 服务器
console.log("init websocket")
let twss = new WebSocket.Server({ port: PORT + 1 });
// 监听服务器启动成功
twss.on('listening', () => {
    console.log(`✅ WebSocket 服务器启动成功！`);
    console.log(`📍 监听端口: ${PORT + 1}`);
    console.log(`🔗 连接地址: ws://localhost:${PORT + 1}`);
});

twss.on('connection', (ws, req) => {
    console.log(`connection`)
    ws.on('message', async (message) => {
        const data = JSON.parse(message);
        console.log(JSON.stringify(data))
        switch (data.type) {
            case 'login':
                return await login(ws, data.code)
            case 'logout':
                return logout(data.openid)
            case 'match':
                return match(ws, data.openid)
            case 'eat':
                return eat(data.openid, data.roomId, data.attackerIdx, data.victimIdx)
            case 'move':
                return move(data.openid, data.roomId, data.fromIdx, data.toPos)
            case 'gameAgain':
                return gameAgain(data.roomId)
            case 'gameOver':
                return gameOver(data.roomId, data.openid)
        }
    })
});
async function login(ws, code) {
    const params = {
        appid: APPID,
        secret: SECRET,
        code: code
    };
    // 构建 URL
    const queryString = new URLSearchParams(params).toString();
    const url = `https://minigame.zijieapi.com/mgplatform/api/apps/jscode2session?${queryString}`;
    // 发送请求 - 使用 await 等待结果
    // const response = await fetch(url, {
    //     method: 'GET',
    //     headers: {
    //         'Content-Type': 'application/json'
    //     }
    // });
    // const data = await response.json();
    // console.log('抖音接口响应:', data)
    // let openid = data.openid + `${debugOpenid++ % 2}`
    let openid = 'test' + `${debugOpenid++ % 2}`
    console.log(`login openid:${openid}`)
    ws.send(JSON.stringify({ type: 'login', openid: openid }))
    let player = JSON.parse(await redis.get(openid))

    console.log(`palyer from redis:${JSON.stringify(player)}`)
    players.set(openid, player == null ? [0, 0, 0] : player)
    wss.set(openid, ws)
    console.log(`players size:${players.size}`)
}
function logout(openid) {
    redis.set(openid, JSON.stringify(players.get(openid)))
    players.delete(openid);
    wss.delete(openid)
    console.log(`players size:${players.size}`)
}
function match(ws, openid) {
    waiting.unshift(openid)
    console.log(`matching size:${waiting.length}`)
    if (waiting.length < 2) return
    let redId = waiting.pop();
    let blackId = waiting.pop();
    rooms.set(++roomId, [redId, blackId])
    gameAgainList.set(roomId, 2)
    wss.get(redId).send(JSON.stringify({
        type: 'match',
        roomId: roomId,
        imRed: true
    }))
    wss.get(blackId).send(JSON.stringify({
        type: 'match',
        roomId: roomId,
        imRed: false
    }))
}
function settlement(roomId_, redWin = true, draw = false) {
    let room = rooms.get(roomId_)
    if (room.length != 2) return
    let winIdx = redWin ? room[0] : room[1]
    let looseIdx = redWin ? room[1] : room[1]
    let win = players.get(winIdx)
    let loose = players.get(looseIdx)
    if (draw) {
        win[2] += 1
        loose[2] += 1
    } else {
        win[0] += 1
        loose[1] += 1
    }
    redis.set(winIdx, JSON.stringify(win))
    redis.set(looseIdx, JSON.stringify(loose))
}
function eat(openid, roomId_, attackerIdx, victimIdx) {
    let room = rooms.get(roomId_)
    if (room.length != 2) return
    if (victimIdx == 4) settlement(roomId_, true)
    if (victimIdx == 27) settlement(roomId_, false)
    if (openid == room[0]) {
        openid = room[1]
    } else {
        openid = room[0]
    }
    wss.get(openid).send(JSON.stringify({
        type: 'eat',
        attackerIdx: attackerIdx,
        victimIdx: victimIdx
    }))
}
function move(openid, roomId, fromIdx, toPos) {
    let room = rooms.get(roomId)
    if (room.length != 2) return
    if (openid == room[0]) {
        openid = room[1]
    } else {
        openid = room[0]
    }
    wss.get(openid).send(JSON.stringify({
        type: 'move',
        fromIdx: fromIdx,
        toPos: toPos
    }))
}
function gameAgain(roomId_) {
    if (gameAgainList.get(roomId_) == 2) {
        gameAgainList.set(roomId_, 1)
        return
    }
    let redId = rooms.get(roomId_)[1];
    let blackId = rooms.get(roomId_)[0];
    rooms.set(roomId_, [redId, blackId])
    gameAgainList.set(roomId_, 2)
    wss.get(redId).send(JSON.stringify({
        type: 'match',
        roomId: roomId_,
        imRed: true
    }))
    wss.get(blackId).send(JSON.stringify({
        type: 'match',
        roomId: roomId_,
        imRed: false
    }))
}
function gameOver(roomId_, openid) {
    let room = rooms.get(roomId)
    if (room.length != 2) return
    if (openid == room[0]) {
        openid = room[1]
    } else {
        openid = room[0]
    }
    wss.get(openid).send(JSON.stringify({
        type: 'gameOver'
    }))
    rooms.delete(roomId_)
    gameAgainList.delete(roomId_)
}
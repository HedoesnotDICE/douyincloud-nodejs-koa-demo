// import Client, { AppsJscode2sessionRequest } from '@open-dy/open_api_sdk';
// import CredentialClient from '@open-dy/open_api_credential';
const Client = require('@open-dy/open_api_sdk');
const AppsJscode2sessionRequest = require('@open-dy/open_api_sdk');
const CredentialClient = require('@open-dy/open_api_credential');
// 传入 clientKey 和 clientSecret
const APP_ID = 'tt67291194f948177e02'
const SECRET = 'anything'
async function apiLogin(ctx) {
    const client = new Client({ clientKey: APP_ID, clientSecret: SECRET }); // 改成自己的app_id跟secret
    /* 构建请求参数，该代码示例中只给出部分参数，请用户根据需要自行构建参数值
        token:
           1.若用户自行维护token,将用户维护的token赋值给该参数即可
           2.SDK包中有获取token的函数，请根据接口path在《OpenAPI SDK 总览》文档中查找获取token函数的名字
             在使用过程中，请注意token互刷问题
        header:
           sdk中默认填充content-type请求头，若不需要填充除content-type之外的请求头，删除该参数即可
    */
    const params = new AppsJscode2sessionRequest({
        anonymousCode: "hheVSHLKwS",
        appid: APP_ID,
        code: "xS7Cz8NJOV",
        secret: SECRET,
    })
    // 调用方法发起请求
    const messageRes = await client.appsJscode2session(params);
    console.log('messageRes', messageRes);
}

// module.exports = { apiLogin };
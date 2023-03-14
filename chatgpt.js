import plugin from '../../lib/plugins/plugin.js'



async function generateCharacter (text) {
  let res = await fetch("http://192.168.2.20:5000/chat", {
    "body": JSON.stringify({ "content": "你现在的名字是" + text + ", 请回答我的问题" }),
    "method": "POST"
  });
  let resBody = await res.json();
  console.log(resBody);
  let chatRole = { "chat_id": resBody.chat_id };
  if (resBody.chat_id) {
    redis.set('人格' + text, JSON.stringify(chatRole));
  }
  return chatRole;
}

export class ChatGPT extends plugin {
  constructor() {
    super({
      name: 'GPT聊天',
      dsc: '使用openai接口的聊天机器人',
      event: 'message',
      priority: 69999,
      rule: [
        {
          /** 暂时使用正则匹配 */
          reg: '^#召唤(.*)+',
          /** 执行方法 */
          fnc: 'doRep'
        }, {
          reg: '^#结束服务(.*)+',
          fnc: 'finishService'
        }, {
          reg: '^#删除上一段对话',
          fnc: 'doDelChat'
        }, {
          reg: '.*',
          fnc: 'doChat'
        }
      ]
    })
  }


  async finishService () {
    let message = '';
    if (this.e.message) {
      for (let val of this.e.message) {
        if (val.type === 'text' && val.text.length > 4) {
          message = val.text.substr(5);
        }
      }
    }
    let chatRoleString = await redis.get('人格' + message);
    this.cancel('人格' + message);
    let chatRole = JSON.parse(chatRoleString);
    await redis.del(this.e.group_id + '人格');
    chatRole.isUsing = false;
    await redis.set('人格' + message, JSON.stringify(chatRole));
  }

  async cancel (roleName) {
    let charRoleString = await redis.get(roleName);
    let charRole = JSON.parse(charRoleString);
    charRole.isUsing = false;
    await redis.set(roleName, JSON.stringify(charRole));
    console.log('停止角色服务:' + charRoleString);
  }

  async doRep () {
    let recall = false;
    let text = '';
    let chatRole = {};

    if (this.e.message) {
      for (let val of this.e.message) {
        if (val.type === 'text' && val.text.length > 3) {
          text = val.text.replace(/＃|井/g, '#').trim().substr(3);
          let chatRoleString = await redis.get('人格' + text);
          chatRole = JSON.parse(chatRoleString);
          if (!chatRole && this.e.isMaster) {
            this.reply(text + '暂不存在,正在生成人格!', true);
            chatRole = await generateCharacter(text);
            this.reply('角色' + text + '人格生成完毕!', true);
            recall = true;
          }
          else {
            console.log(chatRole);
            if (chatRole.isUsing) {
              this.reply('抱歉, 角色' + text + '正在服务中, 请稍后再试哦~')
            } else {
              recall = true;
            }
          }
        }
      }
    }
    if (!recall && !chatRole) {
      this.reply('抱歉, 你召唤的角色不存在哦', true);
    }
    if (recall) {
      this.reply('角色' + text + '为您服务!', true);
      chatRole.exp = new Date(new Date().getTime() + 600000000);
      chatRole.group = String(this.e.group_id);
      chatRole.isUsing = true;
      await redis.set('人格' + text, JSON.stringify(chatRole));
      await redis.set(String(this.e.group_id) + '人格', '人格' + text);
    }
  }

  async doDelChat () {
    let chatRoleName = await redis.get(String(this.e.group_id) + '人格');
    let chatRoleString = await redis.get(chatRoleName);
    let chatRole = JSON.parse(chatRoleString);
    let res = await fetch("http://192.168.2.20:5000/chat/del", {
        "body": JSON.stringify({ "chat_id": chatRole.chat_id }),
        "method": "POST"
      });
  }

  async doChat () {

    if (this.e.atme || this.e.message_type === "private") {
      let chatRoleName = await redis.get(String(this.e.group_id) + '人格');
      let chatRoleString = await redis.get(chatRoleName);
      let chatRole = JSON.parse(chatRoleString);
      console.log('尝试chatgpt回答');
      let messageText = '';
      for (let val of this.e.message) {
        if (val.type === 'text') {
          messageText = messageText + val.text;
        }
      }
      console.log(chatRoleName + '尝试回答问题' + messageText);
      let res = await fetch("http://192.168.2.20:5000/chat", {
        "body": JSON.stringify({ "chat_id": chatRole.chat_id, "content": messageText }),
        "method": "POST"
      });
      console.log(res);
      let resJson = await res.json();
      console.log(resJson);
      this.reply(resJson.content, true);
    }
    return false;
  }
}

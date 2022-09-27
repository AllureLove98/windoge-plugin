import fs from "fs";
import fetch from "node-fetch";
import { segment } from "oicq";
import {
    Cfg,
    Data
} from "../components/index.js";
import utils from "./utils.js";


const _path = process.cwd();
const HoyolabEventListApiUrl = "https://bbs-api-os.hoyolab.com/community/community_contribution/wapi/event/list?gids=2&size=15"
const HoyolabWebHost = "https://www.hoyolab.com"
const reqHeaders = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/105.0.0.0 Safari/537.36",
    "x-rpc-client_type": 4,
    "x-rpc-language": "zh-cn",
    "x-rpc-show-translated": true,
}

async function getEvent() {
    const redisKey = "windoge:hoyolab:event"
    let cacheData = await redis.get(redisKey)
    if (cacheData) {
      return JSON.parse(cacheData)
    }
    let param = {
        headers: reqHeaders,
        timeout: 10000,
        method: 'get',
    }
    let eventData = {
        hoyoquiz: null,
        twitch: null
    }
    let response = {}
    try {
        response = await fetch(HoyolabEventListApiUrl, param)
    } catch (error) {
        Bot.logger.error(error.toString())
        return eventData
    }
    if (!response.ok) {
        Bot.logger.error(`Hoyolab event接口请求失败] ${response.status} ${response.statusText}`)
        return eventData
    }
    const res = await response.json()
    if (!res) {
        Bot.logger.mark('Hoyolab Event接口没有返回')
        return eventData
    }

    if (res.retcode !== 0) {
        Bot.logger.mark(`Hoyolab event接口请求错误, 参数:${JSON.stringify(param)}`)
        return eventData
    }

    let now = Date.now() / 1000

    res.data.list.forEach(val => {
        // hoyo quiz的结束时间约等于答题活动结束
        if (val.name.includes('HoYo Quiz') && val.name.includes('场次公开') && val.end >= now) {
            Bot.logger.debug(`获取到满足条件的活动,${val.name}, ${val.desc}`)
            eventData.hoyoquiz = val
        }
        
        // 直播活动报名结束时间，一般为开始时间后7天
        if (val.name.includes('Twitch创作者成长营') && now - val.start < 3600 * 24 * 7) {
            Bot.logger.debug(`获取到满足条件的活动,${val.name}, ${val.desc}`)
            eventData.twitch = val
        }
    });
    redis.set(redisKey, JSON.stringify(eventData), { EX: 1800 });
    return eventData
}

export async function eventPushJob(e) {
    if (!Cfg.get("hoyolab.event")) {
        return false;
    }
    if (e.msg) return false; // 注释这一行，master就可以手动发起推送了
    if (e.msg && !e.isMaster) {
        return false;
    }

}

export async function checkEvent(e) {
    // if (!Cfg.get("hoyolab.event")) {
    //     return false;
    // }

    let eventData = await getEvent()
    let needMakeMsg = eventData.hoyoquiz !== null && eventData.twitch !== null

    let msg = ""
    let msgData = []

    if (eventData.hoyoquiz === null && eventData.twitch === null){
        msg = "暂时未查询到hoyolab活动"
    } else {
        let descContent = ""
        msg = "当前hoyolab可获得原石活动如下:\n"
        if (needMakeMsg) {
            msgData.push(msg)
            msg = ''
        }
        if (eventData.hoyoquiz !== null) {
            msg += `[Hoyo Quiz]${eventData.hoyoquiz.name}\n`
            descContent = `活动描述:${eventData.hoyoquiz.desc}`
            if (descContent.length > 75) {
                descContent = `${descContent.substring(0, 72)}...`
            }
            msg += `${descContent}\n`
            msg += `${HoyolabWebHost}${eventData.hoyoquiz.web_path}\n`
            if (needMakeMsg) {
                msgData.push(msg)
                msg = ''
            }
        }
        if (eventData.twitch !== null) {
            msg += `[Twitch创作者成长营]${eventData.twitch.name}\n`
            descContent = `活动描述:${eventData.twitch.desc}`
            if (descContent.length > 75) {
                descContent = `${descContent.substring(0, 72)}...`
            }
            msg += `${descContent}\n`
            msg += `${HoyolabWebHost}${eventData.twitch.web_path}\n`
            if (needMakeMsg) {
                msgData.push(msg)
                msg = ''
            }
        }
    }
    if (needMakeMsg) {
        await utils.replyMake(e, msgData, 0)
    } else {
        e.reply(msg)
    }
    return true
}

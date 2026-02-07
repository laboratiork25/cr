import { smsg } from './lib/simple.js'
import { format } from 'util'
import { fileURLToPath } from 'url'
import path, { join } from 'path'
import { unwatchFile, watchFile } from 'fs'
import chalk from 'chalk'
import NodeCache from 'node-cache'

// ==================== CACHE OTTIMIZZATE ====================
if (!global.groupCache) {
    global.groupCache = new NodeCache({ stdTTL: 7200, useClones: false })
}
if (!global.jidCache) {
    global.jidCache = new NodeCache({ stdTTL: 14400, useClones: false })
}
if (!global.nameCache) {
    global.nameCache = new NodeCache({ stdTTL: 14400, useClones: false })
}

if (!global.statsCache) {
    global.statsCache = new NodeCache({ stdTTL: 300, useClones: false })
}

if (!global.messageBuffer) {
    global.messageBuffer = new Map()
}

if (!global.antiFlood) {
    global.antiFlood = new Map()
}

export const fetchMetadata = async (conn, chatId) => await conn.groupMetadata(chatId)

const fetchGroupMetadataWithRetry = async (conn, chatId, retries = 2, delay = 500) => {
    for (let i = 0; i < retries; i++) {
        try {
            return await conn.groupMetadata(chatId);
        } catch (e) {
            if (i === retries - 1) throw e;
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
}

// Listener per aggiornamenti gruppi
if (!global.cacheListenersSet) {
    const conn = global.conn
    if (conn) {
        conn.ev.on('groups.update', async (updates) => {
            for (const update of updates) {
                if (!update?.id) continue;
                try {
                    const metadata = await fetchGroupMetadataWithRetry(conn, update.id)
                    if (metadata) {
                        global.groupCache.set(update.id, metadata)
                    }
                } catch (e) {}
            }
        })
        global.cacheListenersSet = true
    }
}

const isNumber = x => typeof x === 'number' && !isNaN(x)
const delay = ms => isNumber(ms) && new Promise(resolve => setTimeout(resolve, ms))

// ==================== PARTICIPANTS UPDATE ====================
export async function participantsUpdate({ id, participants, action }) {
    if (!global.db?.data?.chats?.[id]) return
    
    try {
        let metadata = global.groupCache.get(id) || await fetchMetadata(this, id)
        if (!metadata) return
        global.groupCache.set(id, metadata)
        
        for (const user of participants) {
            const normalizedUser = this.decodeJid(user)
            let userName = global.nameCache.get(normalizedUser);
            if (!userName) {
                userName = (await this.getName(normalizedUser)) || normalizedUser.split('@')[0] || 'Sconosciuto'
                global.nameCache.set(normalizedUser, userName);
            }
        }
    } catch (e) {}
}

// ==================== ANTI-FLOOD SYSTEM SEMPLIFICATO ====================
function checkAntiFlood(userId, chatId) {
    const now = Date.now()
    const key = `${userId}_${chatId}`
    
    if (!global.antiFlood.has(key)) {
        global.antiFlood.set(key, {
            messages: [],
            blockedUntil: 0,
            notified: false  // Flag per evitare spam di notifiche
        })
    }
    
    const userData = global.antiFlood.get(key)
    
    // Se è bloccato, non contare messaggi
    if (now < userData.blockedUntil) {
        return { blocked: true, silent: true }  // Silent = non mandare altri messaggi
    }
    
    // Pulisci messaggi vecchi (oltre 5 secondi)
    userData.messages = userData.messages.filter(t => now - t < 5000)
    userData.messages.push(now)
    
    const msgCount = userData.messages.length
    
    // Se supera 6 messaggi in 5 secondi → blocca per 5 minuti
    if (msgCount >= 6) {
        userData.blockedUntil = now + (5 * 60 * 1000)  // 5 minuti
        userData.messages = []
        userData.notified = false  // Reset flag per nuova notifica
        return { blocked: true, timeout: 5, isNew: true }
    }
    
    return { blocked: false }
}

if (!global.antiFloodCleanup) {
    global.antiFloodCleanup = setInterval(() => {
        const now = Date.now()
        for (const [key, data] of global.antiFlood.entries()) {
            // Rimuovi entry vecchie (oltre 10 minuti di inattività)
            if (data.blockedUntil < now && data.messages.length === 0) {
                global.antiFlood.delete(key)
            }
        }
    }, 5 * 60 * 1000)
}


// ==================== BATCH WRITE SYSTEM ====================
if (!global.messageFlushInterval) {
    global.messageFlushInterval = setInterval(() => {
        if (global.messageBuffer.size > 0) {
            flushMessageBuffer()
        }
    }, 30 * 1000)
}

export function flushMessageBuffer() {
    try {
        for (const [chatId, users] of global.messageBuffer.entries()) {
            if (!global.db.data.chats[chatId]) continue
            
            for (const [userId, count] of users.entries()) {
                let normalizedUserId = userId
                if (userId.endsWith('@lid')) {
                    normalizedUserId = `${userId.split('@')[0]}@s.whatsapp.net`
                }
                
                // Update DB
                if (!global.db.data.chats[chatId].users) {
                    global.db.data.chats[chatId].users = {}
                }
                if (!global.db.data.chats[chatId].users[normalizedUserId]) {
                    global.db.data.chats[chatId].users[normalizedUserId] = { 
                        messages: 0, 
                        lastMessage: 0,
                        firstMessage: Date.now()
                    }
                }
                
                global.db.data.chats[chatId].users[normalizedUserId].messages += count
                global.db.data.chats[chatId].users[normalizedUserId].lastMessage = Date.now()
                
                if (!global.db.data.users[normalizedUserId]) {
                    global.db.data.users[normalizedUserId] = {
                        messages: 0,
                        name: '?',
                        banned: false,
                        firstTime: Date.now()
                    }
                }
                global.db.data.users[normalizedUserId].messages += count
                
                // ==================== UPDATE PERIODIC STATS ====================
                if (global.periodicStats && normalizedUserId.endsWith('@s.whatsapp.net')) {
                    const periods = ['daily', 'weekly', 'monthly', 'yearly']
                    for (const period of periods) {
                        if (!global.periodicStats[period].users[normalizedUserId]) {
                            global.periodicStats[period].users[normalizedUserId] = 0
                        }
                        global.periodicStats[period].users[normalizedUserId] += count
                    }
                }
            }
        }
        
        global.messageBuffer.clear()
        global.statsCache.flushAll()
        
    } catch (e) {
        console.error('Errore flush buffer:', e)
    }
}

if (!global.dbSaveInterval) {
    global.dbSaveInterval = setInterval(() => {
        if (global.db && global.db.write) {
            global.db.write().catch(console.error)
        }
    }, 5 * 60 * 1000)
}

// ==================== MAIN HANDLER ====================
export async function handler(chatUpdate) {
    this.msgqueque = this.msgqueque || []
    this.uptime = this.uptime || Date.now()
    if (!chatUpdate) return
    
    this.pushMessage(chatUpdate.messages).catch(console.error)
    let m = chatUpdate.messages[chatUpdate.messages.length - 1]
    if (!m) return

    if (m.message?.protocolMessage?.type === 'MESSAGE_EDIT') {
        const key = m.message.protocolMessage.key;
        const editedMessage = m.message.protocolMessage.editedMessage;
        m.key = key;
        m.message = editedMessage;
        m.text = editedMessage.conversation || editedMessage.extendedTextMessage?.text || '';
        m.mtype = Object.keys(editedMessage)[0];
    }

    m = smsg(this, m, global.store)
    if (!m?.key || !m.chat || !m.sender) return
    if (m.fromMe) return
    if (m.key.participant?.includes(':') && m.key.participant.split(':')[1]?.includes('@')) return

    if (m.key) {
        m.key.remoteJid = this.decodeJid(m.key.remoteJid)
        if (m.key.participant) m.key.participant = this.decodeJid(m.key.participant)
    }
    if (!m.key.remoteJid) return

    try {
        if (!global.db.data) await global.loadDatabase()
        
        const normalizedSender = this.decodeJid(m.sender)
        if (!normalizedSender) return
        
        // ==================== FIX @lid → @s.whatsapp.net ====================
        let userJid = normalizedSender
        let displayName = m.pushName || 'Sconosciuto'
        
        if (userJid.endsWith('@lid')) {
            const phoneNumber = userJid.split('@')[0]
            userJid = `${phoneNumber}@s.whatsapp.net`
        }
        
        // Salva/aggiorna nome in cache
        if (displayName !== 'Sconosciuto') {
            global.nameCache.set(userJid, displayName)
        } else if (global.nameCache.has(userJid)) {
            displayName = global.nameCache.get(userJid)
        }
        
        // Init rapido DB
        global.db.data.users = global.db.data.users || {}
        global.db.data.chats = global.db.data.chats || {}
        global.db.data.stats = global.db.data.stats || {}
        global.db.data.settings = global.db.data.settings || {}
        
        let user = global.db.data.users[userJid]
        if (!user) {
            user = global.db.data.users[userJid] = {
                messages: 0,
                name: displayName,
                banned: false,
                firstTime: Date.now()
            }
        } else {
            // Aggiorna nome se cambiato
            if (displayName !== 'Sconosciuto' && user.name !== displayName) {
                user.name = displayName
            }
        }
        
        let chat = global.db.data.chats[m.chat]
        if (!chat) {
            chat = global.db.data.chats[m.chat] = {
                isBanned: false,
                chatrank: m.isGroup ? true : false,
                totalMessages: 0,
                users: {}
            }
        }
        
        const isCommand = m.text && global.prefix.test(m.text)
       // ==================== CONTEGGIO MESSAGGI ====================
if (m.isGroup && chat.chatrank && !isCommand) {
    const skipTypes = ['reactionMessage', 'pollUpdateMessage', 'stickerMessage', 'imageMessage', 'videoMessage', 'audioMessage', 'documentMessage', 'ptvMessage']
    
    if (!skipTypes.includes(m.mtype) && (m.mtype === 'conversation' || m.mtype === 'extendedTextMessage')) {
        const floodCheck = checkAntiFlood(userJid, m.chat)
        
        // Se bloccato, non contare il messaggio
        if (floodCheck.blocked) {
            // Manda notifica SOLO la prima volta
            if (floodCheck.isNew) {
                this.sendMessage(m.chat, {
                    text: `⚠️ *${displayName}* escluso dal conteggio per spam!\n⏱️ Timeout: 5 minuti`,
                    mentions: [userJid]
                }).catch(() => {})
            }
            return  // Non contare questo messaggio
        }
        
        // Buffer messaggi
        if (!global.messageBuffer.has(m.chat)) {
            global.messageBuffer.set(m.chat, new Map())
        }
        const chatBuffer = global.messageBuffer.get(m.chat)
        chatBuffer.set(userJid, (chatBuffer.get(userJid) || 0) + 1)
        
        chat.totalMessages = (chat.totalMessages || 0) + 1

        // ==================== UPDATE STATS ====================
        try {
            const { updatePeriodicStats } = await import('./plugins/top.js')
            if (updatePeriodicStats) {
                updatePeriodicStats(m.chat, userJid)
            }
        } catch (e) {}

        try {
            const { updateChallengeProgress } = await import('./plugins/sfide.js')
            if (updateChallengeProgress) {
                updateChallengeProgress(m.chat, userJid)
            }
        } catch (e) {}
    }


}

        
        if (!isCommand) return
        
        // ==================== COMMAND HANDLING ====================
        m.exp = 0
        m.isCommand = false
        
        if (m.mtype === 'pollUpdateMessage' || m.mtype === 'reactionMessage') return
        
        let settings = global.db.data.settings[this.user.jid]
        if (!settings) {
            settings = global.db.data.settings[this.user.jid] = { autoread: false }
        }
        
        let isOwner = global.owner?.some(([num]) => num + '@s.whatsapp.net' === userJid) || false
        
        // ==================== PLUGIN SYSTEM ====================
        const ___dirname = join(path.dirname(fileURLToPath(import.meta.url)), './plugins/index')
        
        for (let name in global.plugins) {
            let plugin = global.plugins[name]
            if (!plugin) continue
            
            const __filename = join(___dirname, name)
            
            const str2Regex = str => str.replace(/[|\\{}()[\]^$+*?.]/g, '\\$&')
            let _prefix = plugin.customPrefix || global.prefix || '.'
            let match = (_prefix instanceof RegExp ? [[_prefix.exec(m.text), _prefix]] :
                Array.isArray(_prefix) ? _prefix.map(p => {
                    let regex = p instanceof RegExp ? p : new RegExp(str2Regex(p));
                    return [regex.exec(m.text), p];
                }) :
                typeof _prefix === 'string' ? [[new RegExp(str2Regex(_prefix)).exec(m.text), _prefix]] :
                [[[], new RegExp]]).find(p => p[1])
            
            if (typeof plugin !== 'function') continue
            if (!match || !match[0]) continue
            
            let usedPrefix = (match[0] || '')[0]
            if (usedPrefix) {
                let noPrefix = m.text.replace(usedPrefix, '')
                let [command, ...args] = noPrefix.trim().split` `.filter(v => v)
                args = args || []
                let _args = noPrefix.trim().split` `.slice(1)
                let text = _args.join` `
                command = (command || '').toLowerCase()
                let fail = plugin.fail || global.dfail
                let isAccept = plugin.command instanceof RegExp ? plugin.command.test(command) :
                    Array.isArray(plugin.command) ? plugin.command.some(cmd => cmd instanceof RegExp ? cmd.test(command) : cmd === command) :
                    typeof plugin.command === 'string' ? plugin.command === command : false
                
                if (!isAccept) continue
                
                if (plugin.disabled && !isOwner) {
                    fail('disabled', m, this)
                    continue
                }
                
                m.plugin = name
                if (chat.isBanned && !isOwner) return
                if (user.banned && !isOwner) {
                    this.sendMessage(m.chat, { text: `🚫 Sei bannato` }, { quoted: m })
                    return
                }
                
                if (plugin.owner && !isOwner) {
                    fail('owner', m, this)
                    continue
                }
                if (plugin.group && !m.isGroup) {
                    fail('group', m, this)
                    continue
                }
                if (plugin.private && m.isGroup) {
                    fail('private', m, this)
                    continue
                }
                
                m.isCommand = true
                let xp = 'exp' in plugin ? parseInt(plugin.exp) : 0
                m.exp += xp
                
                let extra = {
                    match,
                    usedPrefix,
                    noPrefix,
                    _args,
                    args,
                    command,
                    text,
                    conn: this,
                    isOwner,
                    chatUpdate,
                    __dirname: ___dirname,
                    __filename
                }
                
                try {
                    await plugin.call(this, m, extra)
                } catch (e) {
                    m.error = e
                    console.error(`Errore plugin ${name}:`, e)
                    if (e.message.includes('rate-overlimit')) {
                        await delay(3000)
                    }
                    let text = format(e)
                    await this.reply(m.chat, text, m)
                }
                
                break
            }
        }
    } catch (e) {
        console.error(`Errore handler:`, e)
    } finally {
        if (!global.opts['noprint'] && m) {
            setImmediate(async () => {
                try {
                    await (await import(`./lib/print.js`)).default(m, this)
                } catch (e) {}
            })
        }
    }
}

global.dfail = async (type, m, conn) => {
    const msg = {
        owner: '🛡️ Solo owner',
        group: '👥 Solo gruppi',
        private: '📩 Solo privato',
        disabled: '🚫 Disabilitato'
    }[type]
    if (msg) {
        conn.reply(m.chat, msg, m)
    }
}

process.on('exit', () => {
    flushMessageBuffer()
    if (global.db && global.db.write) {
        global.db.write()
    }
})

let file = global.__filename(import.meta.url, true)
watchFile(file, async () => { 
    unwatchFile(file)     
    console.log(chalk.magenta("handler.js aggiornato"))
})

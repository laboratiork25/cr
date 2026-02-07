import { flushMessageBuffer } from '../handler.js'
import chalk from 'chalk'

const delay = ms => new Promise(resolve => setTimeout(resolve, ms))

// ==================== INIZIALIZZAZIONE STATS PERIODICHE ====================
if (!global.periodicStats) {
    global.periodicStats = {
        daily: { lastReset: Date.now(), groups: {}, users: {} },
        weekly: { lastReset: Date.now(), groups: {}, users: {} },
        monthly: { lastReset: Date.now(), groups: {}, users: {} },
        yearly: { lastReset: Date.now(), groups: {}, users: {} }
    }
}

// ==================== FUNZIONI RESET PERIODICO ====================
function getMidnight() {
    const now = new Date()
    const midnight = new Date(now)
    midnight.setHours(24, 0, 0, 0)
    return midnight.getTime()
}

function getNextMonday() {
    const now = new Date()
    const nextMonday = new Date(now)
    const daysUntilMonday = (8 - now.getDay()) % 7 || 7
    nextMonday.setDate(now.getDate() + daysUntilMonday)
    nextMonday.setHours(0, 0, 0, 0)
    return nextMonday.getTime()
}

function getNextMonth() {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth() + 1, 1, 0, 0, 0, 0).getTime()
}

function getNextYear() {
    const now = new Date()
    return new Date(now.getFullYear() + 1, 0, 1, 0, 0, 0, 0).getTime()
}

function formatTimeRemaining(ms) {
    const days = Math.floor(ms / (1000 * 60 * 60 * 24))
    const hours = Math.floor((ms % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
    const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60))
    
    if (days > 0) {
        return `${days}g ${hours}h`
    } else if (hours > 0) {
        return `${hours}h ${minutes}m`
    } else {
        return `${minutes}m`
    }
}

function needsDailyReset() {
    const now = Date.now()
    const lastReset = global.periodicStats.daily.lastReset
    const lastResetDate = new Date(lastReset).setHours(0, 0, 0, 0)
    const todayDate = new Date(now).setHours(0, 0, 0, 0)
    return todayDate > lastResetDate
}

function needsWeeklyReset() {
    const now = new Date()
    const lastReset = new Date(global.periodicStats.weekly.lastReset)
    
    const currentMonday = new Date(now)
    currentMonday.setDate(now.getDate() - now.getDay() + 1)
    currentMonday.setHours(0, 0, 0, 0)
    
    const lastResetMonday = new Date(lastReset)
    lastResetMonday.setDate(lastReset.getDate() - lastReset.getDay() + 1)
    lastResetMonday.setHours(0, 0, 0, 0)
    
    return currentMonday.getTime() > lastResetMonday.getTime()
}

function needsMonthlyReset() {
    const now = new Date()
    const lastReset = new Date(global.periodicStats.monthly.lastReset)
    return now.getMonth() !== lastReset.getMonth() || now.getFullYear() !== lastReset.getFullYear()
}

function needsYearlyReset() {
    const now = new Date()
    const lastReset = new Date(global.periodicStats.yearly.lastReset)
    return now.getFullYear() !== lastReset.getFullYear()
}

function resetPeriodic(period) {
    global.periodicStats[period] = {
        lastReset: Date.now(),
        groups: {},
        users: {}
    }
    console.log(chalk.cyan(`🔄 Reset ${period} stats`))
}

// ==================== AUTO-RESET CHECKER (ogni ora) ====================
if (!global.periodicResetInterval) {
    global.periodicResetInterval = setInterval(() => {
        if (needsDailyReset()) {
            resetPeriodic('daily')
            console.log(chalk.green('✅ Reset giornaliero completato'))
        }
        if (needsWeeklyReset()) {
            resetPeriodic('weekly')
            console.log(chalk.green('✅ Reset settimanale completato'))
        }
        if (needsMonthlyReset()) {
            resetPeriodic('monthly')
            console.log(chalk.green('✅ Reset mensile completato'))
        }
        if (needsYearlyReset()) {
            resetPeriodic('yearly')
            console.log(chalk.green('✅ Reset annuale completato'))
        }
    }, 60 * 60 * 1000)
    
    console.log(chalk.yellow('⏰ Scheduler reset periodici attivo (check ogni ora)'))
}

// Check e reset automatico all'avvio
if (needsDailyReset()) resetPeriodic('daily')
if (needsWeeklyReset()) resetPeriodic('weekly')
if (needsMonthlyReset()) resetPeriodic('monthly')
if (needsYearlyReset()) resetPeriodic('yearly')

// ==================== AGGIORNA STATS PERIODICHE ====================
export function updatePeriodicStats(chatId, userId) {
    // Check reset necessari
    if (needsDailyReset()) resetPeriodic('daily')
    if (needsWeeklyReset()) resetPeriodic('weekly')
    if (needsMonthlyReset()) resetPeriodic('monthly')
    if (needsYearlyReset()) resetPeriodic('yearly')
    
    const periods = ['daily', 'weekly', 'monthly', 'yearly']
    
    for (const period of periods) {
        // Groups (solo JID validi)
        if (chatId.endsWith('@g.us')) {
            if (!global.periodicStats[period].groups[chatId]) {
                global.periodicStats[period].groups[chatId] = 0
            }
            global.periodicStats[period].groups[chatId]++
        }
        
        // Users (solo JID validi)
        if (userId.endsWith('@s.whatsapp.net')) {
            if (!global.periodicStats[period].users[userId]) {
                global.periodicStats[period].users[userId] = 0
            }
            global.periodicStats[period].users[userId]++
        }
    }
}

// ==================== COMANDO .top ====================
export default async function handler(m, { conn, args, isOwner }) {
    flushMessageBuffer()
    
    const tipo = args[0]?.toLowerCase()
    const periodo = args[1]?.toLowerCase()
    
    if (!tipo || !['gruppi', 'utenti', 'groups', 'users'].includes(tipo)) {
        await conn.reply(m.chat, '❌ Usa:\n`.top gruppi [settimanale/mensile/annuale/totale]`\n`.top utenti [settimanale/mensile/annuale/totale]`\n\nDefault = giornaliero', m)
        return
    }
    
    const isGruppi = ['gruppi', 'groups'].includes(tipo)
    
    // Determina periodo (default = giornaliero)
    let periodKey = 'daily'
    let periodName = 'GIORNALIERO'
    let periodIcon = '📅'
    let nextReset = getMidnight()
    
    if (periodo) {
        if (['settimanale', 'weekly', 'settimana'].includes(periodo)) {
            periodKey = 'weekly'
            periodName = 'SETTIMANALE'
            periodIcon = '📆'
            nextReset = getNextMonday()
        } else if (['mensile', 'monthly', 'mese'].includes(periodo)) {
            periodKey = 'monthly'
            periodName = 'MENSILE'
            periodIcon = '📊'
            nextReset = getNextMonth()
        } else if (['annuale', 'yearly', 'anno'].includes(periodo)) {
            periodKey = 'yearly'
            periodName = 'ANNUALE'
            periodIcon = '📈'
            nextReset = getNextYear()
        } else if (['totale', 'total', 'all'].includes(periodo)) {
            periodKey = null
            periodName = 'TOTALE'
            periodIcon = '🌍'
            nextReset = null
        }
    }
    
    if (isGruppi) {
        // ==================== TOP GRUPPI ====================
        let groupRanking = []
        
        if (periodKey) {
            const periodStats = global.periodicStats[periodKey].groups || {}
            
            for (const [jid, messages] of Object.entries(periodStats)) {
                if (messages > 0 && jid.endsWith('@g.us')) {
                    groupRanking.push({ jid, totalMessages: messages })
                }
            }
        } else {
            const allChats = global.db.data.chats || {}
            const uniqueGroups = new Map()
            
            Object.entries(allChats)
                .filter(([jid, data]) => jid.endsWith('@g.us') && data.users)
                .forEach(([jid, data]) => {
                    const totalMessages = Object.values(data.users || {})
                        .reduce((sum, user) => sum + (user.messages || 0), 0)
                    
                    if (totalMessages > 0) {
                        uniqueGroups.set(jid, { jid, totalMessages })
                    }
                })
            
            groupRanking = Array.from(uniqueGroups.values())
        }
        
        groupRanking.sort((a, b) => b.totalMessages - a.totalMessages)
        groupRanking = groupRanking.slice(0, 10)
        
        if (groupRanking.length === 0) {
            await conn.reply(m.chat, `📊 Nessun gruppo con messaggi registrati nel periodo ${periodName.toLowerCase()}`, m)
            return
        }
        
        // ==================== FETCH NOMI GRUPPI ====================
        const groupsList = []
        for (let i = 0; i < groupRanking.length; i++) {
            const { jid, totalMessages } = groupRanking[i]
            
            let groupName = 'Gruppo Sconosciuto'
            if (global.groupCache && global.groupCache.has(jid)) {
                const metadata = global.groupCache.get(jid)
                groupName = metadata?.subject || jid
            } else {
                try {
                    const metadata = await conn.groupMetadata(jid)
                    groupName = metadata?.subject || jid
                    if (global.groupCache) global.groupCache.set(jid, metadata)
                } catch {
                    groupName = jid.split('@')[0]
                }
            }
            
            let medal = ''
            if (i === 0) medal = '🥇'
            else if (i === 1) medal = '🥈'
            else if (i === 2) medal = '🥉'
            else medal = `${i + 1}.`
            
            groupsList.push({
                medal,
                name: groupName,
                messages: totalMessages
            })
        }
        
        // ==================== MESSAGGIO GRUPPI ====================
        let testo = ` ⋆｡˚『 ${periodIcon} ╭ \`TOP GRUPPI ${periodName}\` ╯ 』˚｡⋆

${groupsList.map(g => 
`『 ${g.medal} 』\`${g.name}\`
     💬 ${g.messages.toLocaleString()} messaggi`
).join('\n\n')}`

        // Footer con reset time
        if (nextReset) {
            const timeRemaining = formatTimeRemaining(nextReset - Date.now())
            testo += `\n\n╭────────────╮\n『 ⏰ 』Reset tra: *${timeRemaining}*\n╰────────────╯`
        }
        
        testo = testo.trim()
        
        await delay(300)
        await conn.sendMessage(m.chat, {
            text: testo
        }, { quoted: m })
        
    } else {
        // ==================== TOP UTENTI ====================
        let userRanking = []
        
        if (periodKey) {
            // Periodo specifico: usa periodicStats
            const periodStats = global.periodicStats[periodKey].users || {}
            
            for (const [jid, messages] of Object.entries(periodStats)) {
                if (messages > 0 && jid.endsWith('@s.whatsapp.net')) {
                    userRanking.push([jid, { messages }])
                }
            }
        } else {
            // Totale: usa global.db.data.users
            const allUsers = global.db.data.users || {}
            userRanking = Object.entries(allUsers)
                .filter(([jid, data]) => {
                    return jid.endsWith('@s.whatsapp.net') && data.messages && data.messages > 0
                })
        }
        
        userRanking.sort(([_, a], [__, b]) => b.messages - a.messages)
        userRanking = userRanking.slice(0, 10)
        
        if (userRanking.length === 0) {
            await conn.reply(m.chat, `📊 Nessun utente con messaggi registrati nel periodo ${periodName.toLowerCase()}`, m)
            return
        }
        
        // ==================== FETCH NOMI UTENTI ====================
        const usersList = []
        for (let i = 0; i < userRanking.length; i++) {
            const [jid, data] = userRanking[i]
            
            let userName = data.name || 'Sconosciuto'
            if (global.nameCache && global.nameCache.has(jid)) {
                userName = global.nameCache.get(jid)
            } else if (conn.getName) {
                try {
                    userName = await conn.getName(jid) || userName
                    if (global.nameCache) global.nameCache.set(jid, userName)
                } catch {
                    userName = jid.split('@')[0]
                }
            } else {
                userName = jid.split('@')[0]
            }
            
            let medal = ''
            if (i === 0) medal = '🥇'
            else if (i === 1) medal = '🥈'
            else if (i === 2) medal = '🥉'
            else medal = `${i + 1}.`
            
            usersList.push({
                medal,
                jid,
                name: userName,
                messages: data.messages
            })
        }
        
        // ==================== MESSAGGIO UTENTI ====================
        let testo = ` ⋆｡˚『 ${periodIcon} ╭ \`TOP UTENTI ${periodName}\` ╯ 』˚｡⋆

${usersList.map(u => 
`『 ${u.medal} 』@${u.jid.split('@')[0]}
     💬 ${u.messages.toLocaleString()} messaggi`
).join('\n\n')}`

        // Footer con reset time
        if (nextReset) {
            const timeRemaining = formatTimeRemaining(nextReset - Date.now())
            testo += `\n\n╭────────────╮\n『 ⏰ 』Reset tra: *${timeRemaining}*\n╰────────────╯`
        }
        
        testo = testo.trim()
        
        const mentions = usersList.map(u => u.jid)
        
        await delay(300)
        await conn.sendMessage(m.chat, {
            text: testo,
            mentions: mentions
        }, { quoted: m })
    }
}

handler.help = ['top gruppi [periodo]', 'top utenti [periodo]']
handler.tags = ['rank']
handler.command = /^(top|leaderboard|classifica)$/i

export { handler }

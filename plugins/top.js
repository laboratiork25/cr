import { flushMessageBuffer } from '../handler.js'
import chalk from 'chalk'

const delay = ms => new Promise(resolve => setTimeout(resolve, ms))

// ==================== INIZIALIZZAZIONE STATS PERIODICHE ====================
if (!global.periodicStats) {
    if (global.db?.data?.periodicStats) {
        global.periodicStats = global.db.data.periodicStats
        console.log(chalk.green('✅ Periodic stats caricate dal DB'))
    } else {
        global.periodicStats = {
            daily: { lastReset: Date.now(), groups: {}, users: {} },
            weekly: { lastReset: Date.now(), groups: {}, users: {} },
            monthly: { lastReset: Date.now(), groups: {}, users: {} },
            yearly: { lastReset: Date.now(), groups: {}, users: {} }
        }
        console.log(chalk.yellow('⚠️ Periodic stats inizializzate da zero'))
    }
}

// Salva periodicStats nel DB ogni 5 minuti
if (!global.periodicStatsSaveInterval) {
    global.periodicStatsSaveInterval = setInterval(() => {
        if (global.db?.data && global.periodicStats) {
            global.db.data.periodicStats = global.periodicStats
            console.log(chalk.blue('💾 Periodic stats salvate nel DB'))
        }
    }, 5 * 60 * 1000)
}

// ==================== CACHE GRUPPI ESCLUSI ====================
if (!global.excludedGroupsCache) {
    global.excludedGroupsCache = new Map() // { jid: { name, reason, timestamp } }
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
    const dayOfWeek = now.getDay()
    const daysUntilMonday = dayOfWeek === 0 ? 1 : 8 - dayOfWeek
    const nextMonday = new Date(now)
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

// ==================== FUNZIONI RESET SEMPLIFICATE ====================
function needsDailyReset() {
    const now = new Date()
    const lastReset = new Date(global.periodicStats.daily.lastReset)
    
    return now.getDate() !== lastReset.getDate() || 
           now.getMonth() !== lastReset.getMonth() || 
           now.getFullYear() !== lastReset.getFullYear()
}

function needsWeeklyReset() {
    const now = new Date()
    const lastReset = new Date(global.periodicStats.weekly.lastReset)
    
    const currentMonday = new Date(now)
    const day = currentMonday.getDay()
    const diff = day === 0 ? -6 : 1 - day
    currentMonday.setDate(currentMonday.getDate() + diff)
    currentMonday.setHours(0, 0, 0, 0)
    
    const lastResetMonday = new Date(lastReset)
    const lastDay = lastResetMonday.getDay()
    const lastDiff = lastDay === 0 ? -6 : 1 - lastDay
    lastResetMonday.setDate(lastResetMonday.getDate() + lastDiff)
    lastResetMonday.setHours(0, 0, 0, 0)
    
    return currentMonday.getTime() > lastResetMonday.getTime()
}

function needsMonthlyReset() {
    const now = new Date()
    const lastReset = new Date(global.periodicStats.monthly.lastReset)
    
    return now.getMonth() !== lastReset.getMonth() || 
           now.getFullYear() !== lastReset.getFullYear()
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
    // Pulisci cache esclusioni al reset
    if (period === 'daily') {
        global.excludedGroupsCache.clear()
        console.log(chalk.cyan('🔄 Cache esclusioni pulita'))
    }
    if (global.db?.data) {
        global.db.data.periodicStats = global.periodicStats
        global.db.write().catch(console.error)
    }
    console.log(chalk.cyan(`🔄 Reset ${period} stats`))
}

// ==================== CHECK RESET AD OGNI COMANDO ====================
function checkAndResetIfNeeded() {
    let resetOccurred = false
    
    if (needsDailyReset()) {
        resetPeriodic('daily')
        console.log(chalk.green('✅ Reset giornaliero completato'))
        resetOccurred = true
    }
    if (needsWeeklyReset()) {
        resetPeriodic('weekly')
        console.log(chalk.green('✅ Reset settimanale completato'))
        resetOccurred = true
    }
    if (needsMonthlyReset()) {
        resetPeriodic('monthly')
        console.log(chalk.green('✅ Reset mensile completato'))
        resetOccurred = true
    }
    if (needsYearlyReset()) {
        resetPeriodic('yearly')
        console.log(chalk.green('✅ Reset annuale completato'))
        resetOccurred = true
    }
    
    return resetOccurred
}

// ==================== AUTO-RESET CHECKER ====================
if (!global.periodicResetInterval) {
    global.periodicResetInterval = setInterval(() => {
        checkAndResetIfNeeded()
    }, 5 * 60 * 1000)
    
    console.log(chalk.yellow('⏰ Scheduler reset periodici attivo (check ogni 5 min)'))
}

checkAndResetIfNeeded()

// ==================== FILTRO NOMI GRUPPI ====================
function containsLink(text) {
    const linkPatterns = [
        /https?:\/\//i,
        /chat\.whatsapp\.com/i,
        /wa\.me/i,
        /t\.me/i,
        /discord\.gg/i,
        /bit\.ly/i,
        /tinyurl\.com/i
    ]
    return linkPatterns.some(pattern => pattern.test(text))
}

function isInappropriate(text) {
    const badWords = [
        'porno', 'porn', 'xxx', 'sex', 'nude', 'nudo', 'nuda',
        'onlyfans', 'escort', 'casino', 'scommesse', 'betting'
    ]
    const lowerText = text.toLowerCase()
    return badWords.some(word => lowerText.includes(word))
}

// ==================== FUNZIONE PER ESCLUDERE GRUPPI ====================
async function shouldExcludeGroup(jid, conn) {
    // 1. Check cache esclusioni (valida per 1 ora)
    if (global.excludedGroupsCache.has(jid)) {
        const cached = global.excludedGroupsCache.get(jid)
        if (Date.now() - cached.timestamp < 60 * 60 * 1000) {
            return cached
        }
    }
    
    // 2. Check lista esclusi manuale
    const excludedGroups = global.db.data.excludedGroups || []
    if (excludedGroups.includes(jid)) {
        const result = { excluded: true, reason: 'manuale' }
        global.excludedGroupsCache.set(jid, { ...result, timestamp: Date.now() })
        return result
    }
    
    // 3. Fetch nome gruppo
    let groupName = null
    if (global.groupCache?.has(jid)) {
        groupName = global.groupCache.get(jid)?.subject
    }
    
    if (!groupName) {
        try {
            const metadata = await conn.groupMetadata(jid)
            groupName = metadata?.subject
            if (metadata && global.groupCache) {
                global.groupCache.set(jid, metadata)
            }
        } catch (e) {
            const result = { excluded: true, reason: 'errore_fetch' }
            global.excludedGroupsCache.set(jid, { ...result, timestamp: Date.now() })
            return result
        }
    }
    
    if (!groupName) {
        const result = { excluded: true, reason: 'nome_mancante' }
        global.excludedGroupsCache.set(jid, { ...result, timestamp: Date.now() })
        return result
    }
    
    // 4. Check link nel nome
    if (containsLink(groupName)) {
        console.log(chalk.yellow(`🔗 Gruppo con link escluso: ${groupName}`))
        const result = { excluded: true, reason: 'link', name: groupName }
        global.excludedGroupsCache.set(jid, { ...result, timestamp: Date.now() })
        return result
    }
    
    // 5. Check parole inappropriate
    if (isInappropriate(groupName)) {
        console.log(chalk.yellow(`🚫 Gruppo inappropriato escluso: ${groupName}`))
        const result = { excluded: true, reason: 'inappropriato', name: groupName }
        global.excludedGroupsCache.set(jid, { ...result, timestamp: Date.now() })
        return result
    }
    
    // 6. Gruppo OK
    const result = { excluded: false, name: groupName }
    global.excludedGroupsCache.set(jid, { ...result, timestamp: Date.now() })
    return result
}

// ==================== AGGIORNA STATS PERIODICHE (CON FILTRO) ====================
export async function updatePeriodicStats(chatId, userId, conn) {
    const periods = ['daily', 'weekly', 'monthly', 'yearly']
    
    for (const period of periods) {
        // ==================== FILTRA GRUPPI CON LINK ====================
        if (chatId.endsWith('@g.us')) {
            // Check se il gruppo è escluso PRIMA di contare
            const checkResult = await shouldExcludeGroup(chatId, conn)
            if (checkResult.excluded) {
                // NON contare questo messaggio
                continue
            }
            
            if (!global.periodicStats[period].groups[chatId]) {
                global.periodicStats[period].groups[chatId] = 0
            }
            global.periodicStats[period].groups[chatId]++
        }
        
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
    checkAndResetIfNeeded()
    flushMessageBuffer()
    
    const tipo = args[0]?.toLowerCase()
    const periodo = args[1]?.toLowerCase()
    
    if (!tipo || !['gruppi', 'utenti', 'groups', 'users'].includes(tipo)) {
        await conn.reply(m.chat, '❌ Usa:\n`.top gruppi [settimanale/mensile/annuale/totale]`\n`.top utenti [settimanale/mensile/annuale/totale]`\n\nDefault = giornaliero', m)
        return
    }
    
    const isGruppi = ['gruppi', 'groups'].includes(tipo)
    
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
        
        // ==================== FILTRA GRUPPI ====================
        const groupsList = []
        let excluded = 0
        
        for (const { jid, totalMessages } of groupRanking) {
            if (groupsList.length >= 10) break
            
            const checkResult = await shouldExcludeGroup(jid, conn)
            
            if (checkResult.excluded) {
                excluded++
                continue
            }
            
            let medal = groupsList.length === 0 ? '🥇' : 
                        groupsList.length === 1 ? '🥈' : 
                        groupsList.length === 2 ? '🥉' : 
                        `${groupsList.length + 1}.`
            
            groupsList.push({ medal, name: checkResult.name, messages: totalMessages })
        }
        
        if (groupsList.length === 0) {
            await conn.reply(m.chat, `📊 Nessun gruppo con messaggi registrati nel periodo ${periodName.toLowerCase()}`, m)
            return
        }
        
        let testo = ` ⋆｡˚『 ${periodIcon} ╭ \`TOP GRUPPI ${periodName}\` ╯ 』˚｡⋆

${groupsList.map(g => `『 ${g.medal} 』\`${g.name}\`\n     💬 ${g.messages.toLocaleString()} messaggi`).join('\n\n')}`

        if (nextReset) {
            const timeRemaining = formatTimeRemaining(nextReset - Date.now())
            testo += `\n\n╭────────────╮\n『 ⏰ 』Reset tra: *${timeRemaining}*\n╰────────────╯`
        }
        
        if (excluded > 0) {
            testo += `\n\n_${excluded} gruppo${excluded > 1 ? 'i' : ''} esclus${excluded > 1 ? 'i' : 'o'}_`
        }
        
        await delay(300)
        await conn.sendMessage(m.chat, { text: testo.trim() }, { quoted: m })
        
    } else {
        // ==================== TOP UTENTI ====================
        let userRanking = []
        
        if (periodKey) {
            const periodStats = global.periodicStats[periodKey].users || {}
            
            for (const [jid, messages] of Object.entries(periodStats)) {
                if (messages > 0 && jid.endsWith('@s.whatsapp.net')) {
                    userRanking.push([jid, { messages }])
                }
            }
        } else {
            const allUsers = global.db.data.users || {}
            userRanking = Object.entries(allUsers)
                .filter(([jid, data]) => jid.endsWith('@s.whatsapp.net') && data.messages > 0)
        }
        
        userRanking.sort(([_, a], [__, b]) => b.messages - a.messages)
        userRanking = userRanking.slice(0, 10)
        
        if (userRanking.length === 0) {
            await conn.reply(m.chat, `📊 Nessun utente con messaggi registrati nel periodo ${periodName.toLowerCase()}`, m)
            return
        }
        
        const usersList = []
        for (let i = 0; i < userRanking.length; i++) {
            const [jid, data] = userRanking[i]
            
            let userName = 'Utente'
            
            if (global.db?.data?.users?.[jid]?.name && global.db.data.users[jid].name !== '?') {
                userName = global.db.data.users[jid].name
            } else if (global.nameCache?.has(jid)) {
                userName = global.nameCache.get(jid)
            } else if (conn.getName) {
                try {
                    const fetchedName = await conn.getName(jid)
                    if (fetchedName) {
                        userName = fetchedName
                        if (global.nameCache) global.nameCache.set(jid, userName)
                    }
                } catch (e) {}
            }
            
            if (userName === 'Utente' || userName === '?') {
                const phoneNumber = jid.split('@')[0]
                if (/^\d+$/.test(phoneNumber)) {
                    userName = phoneNumber
                } else {
                    userName = 'Utente Sconosciuto'
                }
            }
            
            let medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`
            
            usersList.push({ medal, jid, name: userName, messages: data.messages })
        }
        
        let testo = ` ⋆｡˚『 ${periodIcon} ╭ \`TOP UTENTI ${periodName}\` ╯ 』˚｡⋆

${usersList.map(u => 
`『 ${u.medal} 』${u.name}
     💬 ${u.messages.toLocaleString()} messaggi`
).join('\n\n')}`

        if (nextReset) {
            const timeRemaining = formatTimeRemaining(nextReset - Date.now())
            testo += `\n\n╭────────────╮\n『 ⏰ 』Reset tra: *${timeRemaining}*\n╰────────────╯`
        }
        
        const mentions = usersList.map(u => u.jid)
        
        await delay(300)
        await conn.sendMessage(m.chat, { text: testo.trim(), mentions }, { quoted: m })
    }
}

handler.help = ['top gruppi [periodo]', 'top utenti [periodo]']
handler.tags = ['rank']
handler.command = /^(top|leaderboard|classifica)$/i

export { handler }

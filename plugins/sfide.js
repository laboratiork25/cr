import { flushMessageBuffer } from '../handler.js'
import chalk from 'chalk'

const delay = ms => new Promise(resolve => setTimeout(resolve, ms))

// ==================== INIZIALIZZAZIONE SFIDE ====================
if (!global.dailyChallenges) {
    global.dailyChallenges = {
        lastReset: Date.now(),
        groups: {
            current: null,
            progress: {} // { chatId: count }
        },
        users: {
            current: null,
            progress: {} // { userId: count }
        }
    }
}

// ==================== LISTA SFIDE GRUPPI ====================
const GROUP_CHALLENGES = [
    {
        id: 'group_messages_500',
        name: '🌟 Primo Passo',
        description: 'Raggiungi 500 messaggi',
        target: 500,
        icon: '🌟'
    },
    {
        id: 'group_messages_1000',
        name: '🔥 Messaggi Bollenti',
        description: 'Raggiungi 1000 messaggi',
        target: 1000,
        icon: '💬'
    },
    {
        id: 'group_messages_1500',
        name: '💪 Guerriero',
        description: 'Raggiungi 1500 messaggi',
        target: 1500,
        icon: '💪'
    },
    {
        id: 'group_messages_2500',
        name: '⚡ Velocità Luce',
        description: 'Raggiungi 2500 messaggi',
        target: 2500,
        icon: '⚡'
    },
    {
        id: 'group_messages_5000',
        name: '🚀 Razzo Spaziale',
        description: 'Raggiungi 5000 messaggi',
        target: 5000,
        icon: '🚀'
    }
]

// ==================== LISTA SFIDE UTENTI ====================
const USER_CHALLENGES = [
    {
        id: 'user_messages_50',
        name: '🌱 Principiante',
        description: 'Invia 50 messaggi',
        target: 50,
        icon: '🌱'
    },
    {
        id: 'user_messages_100',
        name: '🎯 Attivo',
        description: 'Invia 100 messaggi',
        target: 100,
        icon: '🎯'
    },
    {
        id: 'user_messages_200',
        name: '⭐ Veterano',
        description: 'Invia 200 messaggi',
        target: 200,
        icon: '⭐'
    },
    {
        id: 'user_messages_300',
        name: '🔥 Instancabile',
        description: 'Invia 300 messaggi',
        target: 300,
        icon: '🔥'
    },
    {
        id: 'user_messages_500',
        name: '👑 Leggenda',
        description: 'Invia 500 messaggi',
        target: 500,
        icon: '👑'
    }
]

// ==================== FUNZIONI SFIDE ====================
function getMidnight() {
    const now = new Date()
    const midnight = new Date(now)
    midnight.setHours(24, 0, 0, 0)
    return midnight.getTime()
}

function needsReset() {
    const now = Date.now()
    const lastReset = global.dailyChallenges.lastReset
    const lastResetDate = new Date(lastReset).setHours(0, 0, 0, 0)
    const todayDate = new Date(now).setHours(0, 0, 0, 0)
    
    return todayDate > lastResetDate
}

function resetChallenges() {
    // Scegli sfide random
    const randomGroupChallenge = GROUP_CHALLENGES[Math.floor(Math.random() * GROUP_CHALLENGES.length)]
    const randomUserChallenge = USER_CHALLENGES[Math.floor(Math.random() * USER_CHALLENGES.length)]
    
    global.dailyChallenges = {
        lastReset: Date.now(),
        groups: {
            current: randomGroupChallenge,
            progress: {}
        },
        users: {
            current: randomUserChallenge,
            progress: {}
        }
    }
    
    console.log(chalk.cyan(`🎯 Nuova sfida gruppi: ${randomGroupChallenge.name}`))
    console.log(chalk.cyan(`🎯 Nuova sfida utenti: ${randomUserChallenge.name}`))
}

// ==================== AUTO-RESET MEZZANOTTE ====================
function scheduleNextReset() {
    const midnight = getMidnight()
    const now = Date.now()
    const timeUntilMidnight = midnight - now
    
    setTimeout(() => {
        resetChallenges()
        scheduleNextReset() // Programma il prossimo reset
    }, timeUntilMidnight)
    
    const hours = Math.floor(timeUntilMidnight / (1000 * 60 * 60))
    const minutes = Math.floor((timeUntilMidnight % (1000 * 60 * 60)) / (1000 * 60))
    console.log(chalk.yellow(`⏰ Prossimo reset sfide: ${hours}h ${minutes}m`))
}

// Inizializza sfide se non esistono o serve reset
if (needsReset() || !global.dailyChallenges.groups.current || !global.dailyChallenges.users.current) {
    resetChallenges()
}

// Programma reset automatico
if (!global.challengeResetScheduled) {
    scheduleNextReset()
    global.challengeResetScheduled = true
}

// ==================== AGGIORNA PROGRESS IN BACKGROUND ====================
export function updateChallengeProgress(chatId, userId) {
    if (!global.dailyChallenges.groups.current || !global.dailyChallenges.users.current) return
    
    // Update group progress
    if (!global.dailyChallenges.groups.progress[chatId]) {
        global.dailyChallenges.groups.progress[chatId] = 0
    }
    global.dailyChallenges.groups.progress[chatId]++
    
    // Update user progress
    if (!global.dailyChallenges.users.progress[userId]) {
        global.dailyChallenges.users.progress[userId] = 0
    }
    global.dailyChallenges.users.progress[userId]++
}

// ==================== COMANDO .sfide ====================
export default async function handler(m, { conn, args }) {
    
    // Check reset necessario
    if (needsReset()) {
        resetChallenges()
    }
    
    const tipo = args[0]?.toLowerCase()
    
    if (!tipo || !['gruppi', 'utenti', 'groups', 'users'].includes(tipo)) {
        await conn.reply(m.chat, '❌ Usa: `.sfide gruppi` o `.sfide utenti`', m)
        return
    }
    
    const isGruppi = ['gruppi', 'groups'].includes(tipo)
    
    // Flush buffer per dati aggiornati
    flushMessageBuffer()
    
    if (isGruppi) {
        // ==================== SFIDA GRUPPI ====================
        const challenge = global.dailyChallenges.groups.current
        
        if (!challenge) {
            await conn.reply(m.chat, '❌ Nessuna sfida gruppi attiva', m)
            return
        }
        
        // ==================== CALCOLA PROGRESS GRUPPI ====================
        const groupProgress = []
        
        for (const [chatId, progress] of Object.entries(global.dailyChallenges.groups.progress)) {
            if (progress === 0) continue
            
            // Fetch nome gruppo
            let groupName = 'Gruppo Sconosciuto'
            if (global.groupCache && global.groupCache.has(chatId)) {
                const metadata = global.groupCache.get(chatId)
                groupName = metadata?.subject || chatId
            } else {
                try {
                    const metadata = await conn.groupMetadata(chatId)
                    groupName = metadata?.subject || chatId
                    if (global.groupCache) global.groupCache.set(chatId, metadata)
                } catch {
                    groupName = chatId.split('@')[0]
                }
            }
            
            const percentage = Math.min((progress / challenge.target * 100), 100).toFixed(1)
            const completed = progress >= challenge.target
            
            groupProgress.push({
                chatId,
                name: groupName,
                progress,
                percentage: parseFloat(percentage),
                completed
            })
        }
        
        // Ordina per progress
        groupProgress.sort((a, b) => b.progress - a.progress)
        
        // Prendi top 5
        const top5 = groupProgress.slice(0, 5)
        
        // ==================== CALCOLA TEMPO RIMANENTE ====================
        const midnight = getMidnight()
        const now = Date.now()
        const timeLeft = midnight - now
        const hoursLeft = Math.floor(timeLeft / (1000 * 60 * 60))
        const minutesLeft = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60))
        
        // ==================== MESSAGGIO ====================
        let testo = ` ⋆｡˚『 ${challenge.icon} ╭ \`SFIDA GRUPPI\` ╯ 』˚｡⋆

*${challenge.name}*
${challenge.description}

╭─『 🎯 \`OBIETTIVO\` 』─╮

『 ${challenge.icon} 』Target: *${challenge.target.toLocaleString()}* messaggi
『 ⏰ 』Scade tra: *${hoursLeft}h ${minutesLeft}m*

╰────────────╯

╭─『 🏆 \`TOP 5 GRUPPI\` 』─╯
`

        if (top5.length === 0) {
            testo += `\n『 💤 』Nessun gruppo ha ancora iniziato!\n`
        } else {
            for (let i = 0; i < top5.length; i++) {
                const group = top5[i]
                
                // Medal
                let medal = ''
                if (i === 0) medal = '🥇'
                else if (i === 1) medal = '🥈'
                else if (i === 2) medal = '🥉'
                else medal = `${i + 1}.`
                
                // Progress bar
                const barLength = 10
                const filled = Math.floor((group.percentage / 100) * barLength)
                const empty = barLength - filled
                const bar = '█'.repeat(filled) + '░'.repeat(empty)
                
                // Status
                const status = group.completed ? '✅' : '⏳'
                
                testo += `\n『 ${medal} 』\`${group.name}\`\n`
                testo += `     ${status} [${bar}] ${group.percentage}%\n`
                testo += `     💬 ${group.progress.toLocaleString()} / ${challenge.target.toLocaleString()}\n`
            }
        }
        
        testo += `\n╰───────────╯\n\n> Reset automatico ogni giorno a mezzanotte 🌙`
        
        testo = testo.trim()
        
        await delay(300)
        await conn.sendMessage(m.chat, {
            text: testo
        }, { quoted: m })
        
    } else {
        // ==================== SFIDA UTENTI ====================
        const challenge = global.dailyChallenges.users.current
        
        if (!challenge) {
            await conn.reply(m.chat, '❌ Nessuna sfida utenti attiva', m)
            return
        }
        
        // ==================== CALCOLA PROGRESS UTENTI ====================
        const userProgress = []
        
        for (const [userId, progress] of Object.entries(global.dailyChallenges.users.progress)) {
            if (progress === 0) continue
            
            // Fetch nome utente
            let userName = 'Sconosciuto'
            if (global.nameCache && global.nameCache.has(userId)) {
                userName = global.nameCache.get(userId)
            } else if (conn.getName) {
                try {
                    userName = await conn.getName(userId) || userName
                    if (global.nameCache) global.nameCache.set(userId, userName)
                } catch {
                    userName = userId.split('@')[0]
                }
            } else {
                userName = userId.split('@')[0]
            }
            
            const percentage = Math.min((progress / challenge.target * 100), 100).toFixed(1)
            const completed = progress >= challenge.target
            
            userProgress.push({
                userId,
                name: userName,
                progress,
                percentage: parseFloat(percentage),
                completed
            })
        }
        
        // Ordina per progress
        userProgress.sort((a, b) => b.progress - a.progress)
        
        // Prendi top 10
        const top10 = userProgress.slice(0, 10)
        
        // ==================== CALCOLA TEMPO RIMANENTE ====================
        const midnight = getMidnight()
        const now = Date.now()
        const timeLeft = midnight - now
        const hoursLeft = Math.floor(timeLeft / (1000 * 60 * 60))
        const minutesLeft = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60))
        
        // ==================== MESSAGGIO ====================
        let testo = ` ⋆｡˚『 ${challenge.icon} ╭ \`SFIDA UTENTI\` ╯ 』˚｡⋆

*${challenge.name}*
${challenge.description}

╭─『 🎯 \`OBIETTIVO\` 』─╮

『 ${challenge.icon} 』Target: *${challenge.target.toLocaleString()}* messaggi
『 ⏰ 』Scade tra: *${hoursLeft}h ${minutesLeft}m*

╰────────────╯

╭─『 👑 \`TOP 10 UTENTI\` 』─╯
`

        if (top10.length === 0) {
            testo += `\n『 💤 』Nessun utente ha ancora iniziato!\n`
        } else {
            for (let i = 0; i < top10.length; i++) {
                const user = top10[i]
                
                // Medal
                let medal = ''
                if (i === 0) medal = '🥇'
                else if (i === 1) medal = '🥈'
                else if (i === 2) medal = '🥉'
                else if (i < 10) medal = '🏆'
                else medal = `${i + 1}.`
                
                // Progress bar
                const barLength = 10
                const filled = Math.floor((user.percentage / 100) * barLength)
                const empty = barLength - filled
                const bar = '█'.repeat(filled) + '░'.repeat(empty)
                
                // Status
                const status = user.completed ? '✅' : '⏳'
                
                testo += `\n『 ${medal} 』@${user.userId.split('@')[0]}\n`
                testo += `     ${status} [${bar}] ${user.percentage}%\n`
                testo += `     💬 ${user.progress.toLocaleString()} / ${challenge.target.toLocaleString()}\n`
            }
        }
        
        const mentions = top10.map(u => u.userId)
        
        testo += `\n╰────────────╯\n\n> Reset automatico ogni giorno a mezzanotte 🌙`
        
        testo = testo.trim()
        
        await delay(300)
        await conn.sendMessage(m.chat, {
            text: testo,
            mentions: mentions
        }, { quoted: m })
    }
}

handler.help = ['sfide gruppi', 'sfide utenti']
handler.tags = ['rank']
handler.command = /^(sfide|sfida|challenge)$/i

export { handler }

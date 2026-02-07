import { flushMessageBuffer } from '../handler.js'

const delay = ms => new Promise(resolve => setTimeout(resolve, ms))

export default async function handler(m, { conn, isOwner }) {
    if (!m.isGroup) {
        await conn.reply(m.chat, '❌ Questo comando funziona solo nei gruppi', m)
        return
    }
    
    const chat = global.db.data.chats[m.chat]
    if (!chat || !chat.chatrank) {
        await conn.reply(m.chat, '❌ ChatRank non è attivo in questo gruppo', m)
        return
    }
    
    // Flush buffer per avere dati aggiornati
    flushMessageBuffer()
    
    const normalizedSender = conn.decodeJid(m.sender)
    const user = global.db.data.users[normalizedSender]
    const chatUser = chat.users?.[normalizedSender]
    
    if (!chatUser || chatUser.messages === 0) {
        await conn.reply(m.chat, '📊 Non hai ancora messaggi registrati in questo gruppo', m)
        return
    }
    
    // ==================== STATISTICHE GRUPPO ====================
    const chatUsers = chat.users || {}
    const ranking = Object.entries(chatUsers)
        .filter(([_, data]) => data.messages > 0)
        .sort(([_, a], [__, b]) => b.messages - a.messages)
    
    const groupPosition = ranking.findIndex(([jid]) => jid === normalizedSender) + 1
    const totalGroupUsers = ranking.length
    const groupMessages = chatUser.messages
    
    // ==================== STATISTICHE GLOBALI ====================
    const allUsers = global.db.data.users || {}
    const globalRanking = Object.entries(allUsers)
        .filter(([_, data]) => data.messages > 0)
        .sort(([_, a], [__, b]) => b.messages - a.messages)
    
    const globalPosition = globalRanking.findIndex(([jid]) => jid === normalizedSender) + 1
    const totalGlobalUsers = globalRanking.length
    const globalMessages = user?.messages || 0
    
    // ==================== CALCOLA PERCENTILI ====================
    const groupPercentile = ((totalGroupUsers - groupPosition + 1) / totalGroupUsers * 100).toFixed(1)
    const globalPercentile = ((totalGlobalUsers - globalPosition + 1) / totalGlobalUsers * 100).toFixed(1)
    
    // ==================== MEDAGLIE ====================
    let groupMedal = ''
    if (groupPosition === 1) groupMedal = '🥇'
    else if (groupPosition === 2) groupMedal = '🥈'
    else if (groupPosition === 3) groupMedal = '🥉'
    else if (groupPosition <= 10) groupMedal = '🏆'
    else groupMedal = '📊'
    
    let globalMedal = ''
    if (globalPosition === 1) globalMedal = '🥇'
    else if (globalPosition === 2) globalMedal = '🥈'
    else if (globalPosition === 3) globalMedal = '🥉'
    else if (globalPosition <= 10) globalMedal = '🏆'
    else globalMedal = '🌍'

    
    // ==================== MEDIA GIORNALIERA ====================
    let dailyStats = ''
    if (chatUser.firstMessage) {
        const daysSince = Math.floor((Date.now() - chatUser.firstMessage) / (1000 * 60 * 60 * 24))
        if (daysSince > 0) {
            const avgPerDay = (groupMessages / daysSince).toFixed(1)
            dailyStats = `\n『 📅 』\`Attivo da:\` » ${daysSince} giorni\n『 📊 』\`Media:\` » ${avgPerDay} msg/giorno`
        }
    }
    
    // ==================== MESSAGGIO FINALE ====================
    const testo = ` ⋆｡˚『 📊 ╭ \`TUE STATS\` ╯ 』˚｡⋆

╭──『 🏠 \`GRUPPO\` 』──╮

『 ${groupMedal} 』\`Rank:\` » *#${groupPosition}* / ${totalGroupUsers}
『 📨 』\`Messaggi:\` » *${groupMessages.toLocaleString()}*
『 📈 』\`Percentile:\` » Top *${groupPercentile}%*${dailyStats}

╰────────────╯

╭──『 🌍 \`GLOBALE\` 』──╮

『 ${globalMedal} 』\`Rank:\` » *#${globalPosition}* / ${totalGlobalUsers}
『 💬 』\`Totale:\` » *${globalMessages.toLocaleString()}* messaggi
『 📈 』\`Percentile:\` » Top *${globalPercentile}%*

╰────────────╯`.trim()
    
    await delay(300)
    await conn.sendMessage(m.chat, {
        text: testo,
        mentions: [normalizedSender]
    }, { quoted: m })
}

handler.help = ['myrank', 'mystats', 'me']
handler.tags = ['rank']
handler.command = /^(myrank|rank|mystats|me|miei|profilo)$/i
handler.group = true

export { handler }

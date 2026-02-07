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
    
    // ==================== METADATA GRUPPO ====================
    let groupName = 'Gruppo'
    let groupDesc = ''
    let totalParticipants = 0
    
    try {
        const metadata = await conn.groupMetadata(m.chat)
        groupName = metadata.subject || groupName
        groupDesc = metadata.desc || ''
        totalParticipants = metadata.participants?.length || 0
        if (global.groupCache) global.groupCache.set(m.chat, metadata)
    } catch (e) {
        if (global.groupCache && global.groupCache.has(m.chat)) {
            const cached = global.groupCache.get(m.chat)
            groupName = cached.subject || groupName
            groupDesc = cached.desc || ''
            totalParticipants = cached.participants?.length || 0
        }
    }
    
    // ==================== STATISTICHE GRUPPO ====================
    const chatUsers = chat.users || {}
    const totalMessages = chat.totalMessages || 0
    const activeUsers = Object.keys(chatUsers).filter(jid => chatUsers[jid].messages > 0).length
    
    // Trova utente più attivo
    const ranking = Object.entries(chatUsers)
        .filter(([_, data]) => data.messages > 0)
        .sort(([_, a], [__, b]) => b.messages - a.messages)
    
    let topUser = null
    if (ranking.length > 0) {
        const [jid, data] = ranking[0]
        let userName = 'Sconosciuto'
        if (global.nameCache && global.nameCache.has(jid)) {
            userName = global.nameCache.get(jid)
        } else if (conn.getName) {
            try {
                userName = await conn.getName(jid)
                if (global.nameCache) global.nameCache.set(jid, userName)
            } catch {
                userName = jid.split('@')[0]
            }
        }
        topUser = {
            jid,
            name: userName,
            messages: data.messages,
            percentage: ((data.messages / totalMessages) * 100).toFixed(1)
        }
    }
    
    // ==================== POSIZIONE GLOBALE ====================
    const allChats = global.db.data.chats || {}
    const globalRanking = Object.entries(allChats)
        .filter(([jid, data]) => jid.endsWith('@g.us') && data.totalMessages > 0)
        .sort(([_, a], [__, b]) => (b.totalMessages || 0) - (a.totalMessages || 0))
    
    const globalPosition = globalRanking.findIndex(([jid]) => jid === m.chat) + 1
    const totalGroups = globalRanking.length
    
    // Medaglia posizione
    let positionMedal = ''
    if (globalPosition === 1) positionMedal = '🥇'
    else if (globalPosition === 2) positionMedal = '🥈'
    else if (globalPosition === 3) positionMedal = '🥉'
    else if (globalPosition <= 10) positionMedal = '🏆'
    else positionMedal = '📊'
    
    // Percentile
    const percentile = totalGroups > 0 ? ((totalGroups - globalPosition + 1) / totalGroups * 100).toFixed(1) : '0'
    
    // ==================== CALCOLA MEDIA GIORNALIERA ====================
    let dailyAverage = 0
    let activeDays = 0
    
    // Trova il primo messaggio registrato
    const firstMessages = Object.values(chatUsers)
        .map(u => u.firstMessage)
        .filter(t => t > 0)
        .sort((a, b) => a - b)
    
    if (firstMessages.length > 0) {
        const firstTimestamp = firstMessages[0]
        activeDays = Math.floor((Date.now() - firstTimestamp) / (1000 * 60 * 60 * 24))
        if (activeDays > 0) {
            dailyAverage = (totalMessages / activeDays).toFixed(1)
        }
    }
    
    // ==================== BADGE SPECIALE ====================
    let badge = ''
    if (globalPosition === 1) {
        badge = '\n\n⋆｡˚ 👑 *GRUPPO #1 AL MONDO* 👑 ˚｡⋆'
    } else if (globalPosition === 2) {
        badge = '\n\n⋆｡˚ 🥈 *Secondo gruppo più attivo!* ˚｡⋆'
    } else if (globalPosition === 3) {
        badge = '\n\n⋆｡˚ 🥉 *Sul podio mondiale!* ˚｡⋆'
    } else if (globalPosition <= 10) {
        badge = '\n\n⋆｡˚ 🔥 *Top 10 gruppi mondiali!* ˚｡⋆'
    }
    
    // ==================== STATISTICHE PARTECIPAZIONE ====================
    const participationRate = totalParticipants > 0 ? ((activeUsers / totalParticipants) * 100).toFixed(1) : '0'
    
    // ==================== MESSAGGIO FINALE ====================
    let testo = ` ⋆｡˚『 🏠 ╭ \`${groupName}\` ╯ 』˚｡⋆

╭─『 📊 \`STATISTICHE\` 』─╮

『 ${positionMedal} 』\`Posizione:\` » *#${globalPosition}* / ${totalGroups}
『 📈 』\`Percentile:\` » Top *${percentile}%*
『 💬 』\`Messaggi:\` » *${totalMessages.toLocaleString()}*
『 👥 』\`Membri:\` » ${totalParticipants} totali
『 🔥 』\`Attivi:\` » ${activeUsers} utenti (${participationRate}%)`

    if (activeDays > 0) {
        testo += `\n『 📅 』\`Tracciato da:\` » ${activeDays} giorni`
        testo += `\n『 📊 』\`Media:\` » ${dailyAverage} msg/giorno`
    }
    
    testo += '\n\n╰──────────╯'
    
    
    testo += badge
    testo = testo.trim()
    
    const mentions = topUser ? [topUser.jid] : []
    
    await delay(300)
    await conn.sendMessage(m.chat, {
        text: testo,
        mentions: mentions
    }, { quoted: m })
}

handler.help = ['group', 'groupstats', 'gruppo']
handler.tags = ['rank']
handler.command = /^(group|groupstats|gruppo|gruppostats|gstats)$/i
handler.group = true

export { handler }

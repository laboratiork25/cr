export async function handler(m, { conn, isOwner, text }) {
    
    const chats = Object.keys(global.db.data.chats || {})
    const groups = chats.filter(id => id.endsWith('@g.us'))
    const privates = chats.filter(id => !id.endsWith('@g.us'))
    
    let msg = `*📊 STATISTICHE BOT*\n\n`
    msg += `👥 Gruppi: *${groups.length}*\n`
    msg += `💬 Chat private: *${privates.length}*\n`
    msg += `📱 Chat totali: *${chats.length}*\n\n`
    msg += `*🔝 TOP 5 GRUPPI:*\n\n`
    
    // Top 5 gruppi per messaggi
    const groupStats = []
    for (const gid of groups.slice(0, 5)) {
        try {
            const meta = await conn.groupMetadata(gid)
            const chat = global.db.data.chats[gid]
            const totalMsg = Object.values(chat?.users || {})
                .reduce((sum, u) => sum + (u.messages || 0), 0)
            groupStats.push({
                name: meta.subject,
                members: meta.participants.length,
                messages: totalMsg
            })
        } catch (e) {}
    }
    
    groupStats.sort((a, b) => b.messages - a.messages)
    groupStats.slice(0, 5).forEach((g, i) => {
        msg += `${i + 1}. *${g.name}*\n`
        msg += `   👥 ${g.members} membri | 💬 ${g.messages} msg\n\n`
    })
    
    await m.reply(msg)
}

handler.command = /^(vale)$/i

export default handler

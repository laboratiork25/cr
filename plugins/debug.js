export default async function handler(m, { conn }) {
    const daily = global.periodicStats?.daily || {}
    const groups = daily.groups || {}
    const users = daily.users || {}
    
    let testo = `🔍 *DEBUG STATS*\n\n`
    testo += `📊 Daily Groups: ${Object.keys(groups).length}\n`
    testo += `👥 Daily Users: ${Object.keys(users).length}\n\n`
    
    if (Object.keys(groups).length > 0) {
        testo += `*Top 5 Gruppi:*\n`
        const topGroups = Object.entries(groups)
            .sort(([,a], [,b]) => b - a)
            .slice(0, 5)
        
        for (const [jid, count] of topGroups) {
            testo += `- ${jid.substring(0, 20)}...: ${count}\n`
        }
    }
    
    testo += `\n`
    
    if (Object.keys(users).length > 0) {
        testo += `*Top 5 Utenti:*\n`
        const topUsers = Object.entries(users)
            .sort(([,a], [,b]) => b - a)
            .slice(0, 5)
        
        for (const [jid, count] of topUsers) {
            testo += `- ${jid.split('@')[0]}: ${count}\n`
        }
    }
    
    // Check DB globale
    const dbUsers = global.db?.data?.users || {}
    const totalDbUsers = Object.keys(dbUsers).filter(jid => 
        jid.endsWith('@s.whatsapp.net') && dbUsers[jid].messages > 0
    ).length
    
    testo += `\n📁 DB Totale Utenti: ${totalDbUsers}`
    
    await conn.reply(m.chat, testo, m)
}

handler.command = /^debugstats$/i
handler.owner = false

export { handler }

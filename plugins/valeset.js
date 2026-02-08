import chalk from 'chalk'

export default async function handler(m, { conn, args }) {
    
    const periodo = args[0]?.toLowerCase()
    
    if (!periodo || !['giornaliero', 'settimanale', 'mensile', 'annuale', 'daily', 'weekly', 'monthly', 'yearly', 'tutto', 'all'].includes(periodo)) {
        await conn.reply(m.chat, 
            '❌ Usa:\n' +
            '`.valeset giornaliero` - Reset classifica giornaliera\n' +
            '`.valeset settimanale` - Reset classifica settimanale\n' +
            '`.valeset mensile` - Reset classifica mensile\n' +
            '`.valeset annuale` - Reset classifica annuale\n' +
            '`.valeset tutto` - Reset tutte le classifiche', 
            m
        )
        return
    }
    
    let resetted = []
    
    // ==================== RESET SPECIFICO ====================
    if (['giornaliero', 'daily'].includes(periodo)) {
        global.periodicStats.daily = {
            lastReset: Date.now(),
            groups: {},
            users: {}
        }
        resetted.push('📅 Giornaliero')
    }
    else if (['settimanale', 'weekly'].includes(periodo)) {
        global.periodicStats.weekly = {
            lastReset: Date.now(),
            groups: {},
            users: {}
        }
        resetted.push('📆 Settimanale')
    }
    else if (['mensile', 'monthly'].includes(periodo)) {
        global.periodicStats.monthly = {
            lastReset: Date.now(),
            groups: {},
            users: {}
        }
        resetted.push('📊 Mensile')
    }
    else if (['annuale', 'yearly'].includes(periodo)) {
        global.periodicStats.yearly = {
            lastReset: Date.now(),
            groups: {},
            users: {}
        }
        resetted.push('📈 Annuale')
    }
    else if (['tutto', 'all'].includes(periodo)) {
        global.periodicStats = {
            daily: { lastReset: Date.now(), groups: {}, users: {} },
            weekly: { lastReset: Date.now(), groups: {}, users: {} },
            monthly: { lastReset: Date.now(), groups: {}, users: {} },
            yearly: { lastReset: Date.now(), groups: {}, users: {} }
        }
        resetted = ['📅 Giornaliero', '📆 Settimanale', '📊 Mensile', '📈 Annuale']
    }
    
    // ==================== SALVA NEL DB ====================
    if (global.db?.data) {
        global.db.data.periodicStats = global.periodicStats
        await global.db.write().catch(console.error)
    }
    
    // ==================== LOG CONSOLE ====================
    console.log(chalk.cyan(`🔄 Reset manuale: ${resetted.join(', ')}`))
    
    // ==================== MESSAGGIO CONFERMA ====================
    let testo = `✅ *RESET COMPLETATO*\n\n`
    testo += `${resetted.map(r => `${r}`).join('\n')}\n\n`
    testo += `🔄 Classifiche azzerate con successo!`
    
    await conn.reply(m.chat, testo, m)
}

handler.help = ['valeset <periodo>']
handler.tags = ['rank']
handler.command = /^(valeset|resetstats|resetrank)$/i
handler.group = true

export { handler }

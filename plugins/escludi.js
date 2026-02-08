import { flushMessageBuffer } from '../handler.js'
import chalk from 'chalk'

const delay = ms => new Promise(resolve => setTimeout(resolve, ms))

// ==================== INIZIALIZZA LISTA ESCLUSI ====================
if (!global.db.data.excludedGroups) {
    global.db.data.excludedGroups = []
}

// ==================== COMANDO .escludi ====================
export default async function handler(m, { conn, args, isOwner }) {
    
    const action = args[0]?.toLowerCase()
    
    // ==================== HELP ====================
    if (!action || ['help', 'aiuto'].includes(action)) {
        let testo = `📋 *GESTIONE GRUPPI ESCLUSI*

*Comandi disponibili:*

\`\`\`.escludi aggiungi <posizione>\`\`\`
Esclude il gruppo in quella posizione dalla classifica

\`\`\`.escludi rimuovi <posizione>\`\`\`
Rimuove l'esclusione da un gruppo

\`\`\`.escludi lista\`\`\`
Mostra tutti i gruppi esclusi

\`\`\`.escludi questo\`\`\`
Esclude il gruppo corrente

*Esempio:*
\`.escludi aggiungi 3\` → Esclude il gruppo in 3° posizione`

        await conn.reply(m.chat, testo, m)
        return
    }
    
    // ==================== ESCLUDI GRUPPO CORRENTE ====================
    if (['questo', 'current', 'qui'].includes(action)) {
        if (!m.isGroup) {
            await conn.reply(m.chat, '❌ Questo comando funziona solo nei gruppi', m)
            return
        }
        
        const chatId = m.chat
        
        // Verifica se già escluso
        if (global.db.data.excludedGroups.includes(chatId)) {
            await conn.reply(m.chat, '⚠️ Questo gruppo è già escluso dalla classifica', m)
            return
        }
        
        // Aggiungi all'esclusione
        global.db.data.excludedGroups.push(chatId)
        await global.db.write().catch(console.error)
        
        const groupName = (await conn.groupMetadata(chatId).catch(() => {}))?.subject || 'Questo gruppo'
        
        console.log(chalk.yellow(`🚫 Gruppo escluso: ${groupName}`))
        
        await conn.reply(m.chat, `✅ *${groupName}* escluso dalla classifica\n\nUsa \`.escludi rimuovi questo\` per annullare`, m)
        return
    }
    
    // ==================== LISTA GRUPPI ESCLUSI ====================
    if (['lista', 'list', 'all'].includes(action)) {
        if (global.db.data.excludedGroups.length === 0) {
            await conn.reply(m.chat, '📋 Nessun gruppo escluso dalla classifica', m)
            return
        }
        
        let testo = `📋 *GRUPPI ESCLUSI* (${global.db.data.excludedGroups.length})\n\n`
        
        for (let i = 0; i < global.db.data.excludedGroups.length; i++) {
            const chatId = global.db.data.excludedGroups[i]
            
            let groupName = 'Gruppo Sconosciuto'
            try {
                const metadata = await conn.groupMetadata(chatId)
                groupName = metadata?.subject || chatId
            } catch {
                groupName = chatId.split('@')[0]
            }
            
            testo += `${i + 1}. \`${groupName}\`\n`
        }
        
        testo += `\n_Usa_ \`.escludi rimuovi <numero>\` _per rimuovere_`
        
        await conn.reply(m.chat, testo, m)
        return
    }
    
    // ==================== AGGIUNGI ESCLUSIONE ====================
    if (['aggiungi', 'add', 'escludi'].includes(action)) {
        const posizione = parseInt(args[1])
        
        if (!posizione || posizione < 1) {
            await conn.reply(m.chat, '❌ Specifica una posizione valida\n\nEsempio: `.escludi aggiungi 3`', m)
            return
        }
        
        // Flush per dati aggiornati
        flushMessageBuffer()
        
        // Ottieni classifica totale
        const allChats = global.db.data.chats || {}
        const groupRanking = []
        
        Object.entries(allChats)
            .filter(([jid, data]) => jid.endsWith('@g.us') && data.users)
            .forEach(([jid, data]) => {
                const totalMessages = Object.values(data.users || {})
                    .reduce((sum, user) => sum + (user.messages || 0), 0)
                
                if (totalMessages > 0) {
                    groupRanking.push({ jid, totalMessages })
                }
            })
        
        groupRanking.sort((a, b) => b.totalMessages - a.totalMessages)
        
        if (posizione > groupRanking.length) {
            await conn.reply(m.chat, `❌ Posizione non valida. Ci sono solo ${groupRanking.length} gruppi in classifica`, m)
            return
        }
        
        const targetGroup = groupRanking[posizione - 1]
        
        // Verifica se già escluso
        if (global.db.data.excludedGroups.includes(targetGroup.jid)) {
            await conn.reply(m.chat, '⚠️ Questo gruppo è già escluso dalla classifica', m)
            return
        }
        
        // Aggiungi esclusione
        global.db.data.excludedGroups.push(targetGroup.jid)
        await global.db.write().catch(console.error)
        
        // Nome gruppo
        let groupName = 'Gruppo'
        try {
            const metadata = await conn.groupMetadata(targetGroup.jid)
            groupName = metadata?.subject || targetGroup.jid
        } catch {
            groupName = targetGroup.jid.split('@')[0]
        }
        
        console.log(chalk.yellow(`🚫 Gruppo escluso: ${groupName}`))
        
        await conn.reply(m.chat, `✅ Gruppo escluso dalla classifica:\n\n📍 Posizione: #${posizione}\n👥 Nome: \`${groupName}\`\n💬 Messaggi: ${targetGroup.totalMessages.toLocaleString()}\n\n_Non apparirà più nelle classifiche_`, m)
        return
    }
    
    // ==================== RIMUOVI ESCLUSIONE ====================
    if (['rimuovi', 'remove', 'del', 'delete'].includes(action)) {
        const target = args[1]?.toLowerCase()
        
        if (!target) {
            await conn.reply(m.chat, '❌ Specifica cosa rimuovere\n\nEsempio: `.escludi rimuovi 2`\nOppure: `.escludi rimuovi questo`', m)
            return
        }
        
        // Rimuovi gruppo corrente
        if (['questo', 'current', 'qui'].includes(target)) {
            if (!m.isGroup) {
                await conn.reply(m.chat, '❌ Questo comando funziona solo nei gruppi', m)
                return
            }
            
            const chatId = m.chat
            const index = global.db.data.excludedGroups.indexOf(chatId)
            
            if (index === -1) {
                await conn.reply(m.chat, '⚠️ Questo gruppo non è escluso dalla classifica', m)
                return
            }
            
            global.db.data.excludedGroups.splice(index, 1)
            await global.db.write().catch(console.error)
            
            const groupName = (await conn.groupMetadata(chatId).catch(() => {}))?.subject || 'Questo gruppo'
            
            console.log(chalk.green(`✅ Gruppo riammesso: ${groupName}`))
            
            await conn.reply(m.chat, `✅ *${groupName}* riammesso nella classifica`, m)
            return
        }
        
        // Rimuovi per posizione
        const posizione = parseInt(target)
        
        if (!posizione || posizione < 1 || posizione > global.db.data.excludedGroups.length) {
            await conn.reply(m.chat, `❌ Posizione non valida. Ci sono ${global.db.data.excludedGroups.length} gruppi esclusi\n\nUsa \`.escludi lista\` per vedere tutti`, m)
            return
        }
        
        const removedJid = global.db.data.excludedGroups[posizione - 1]
        global.db.data.excludedGroups.splice(posizione - 1, 1)
        await global.db.write().catch(console.error)
        
        let groupName = 'Gruppo'
        try {
            const metadata = await conn.groupMetadata(removedJid)
            groupName = metadata?.subject || removedJid
        } catch {
            groupName = removedJid.split('@')[0]
        }
        
        console.log(chalk.green(`✅ Gruppo riammesso: ${groupName}`))
        
        await conn.reply(m.chat, `✅ Gruppo riammesso nella classifica:\n\n👥 \`${groupName}\`\n\n_Tornerà a comparire nelle classifiche_`, m)
        return
    }
    
    // ==================== COMANDO NON RICONOSCIUTO ====================
    await conn.reply(m.chat, '❌ Comando non riconosciuto\n\nUsa `.escludi help` per vedere tutti i comandi', m)
}

handler.help = ['escludi']
handler.tags = ['rank']
handler.command = /^(exclude1)$/i

export { handler }

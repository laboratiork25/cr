export async function handler(m, { conn, isOwner, text }) {

    
    if (!text) {
        return m.reply(`📢 *USO BROADCAST*

Invia un messaggio a tutti i gruppi dove il bot è presente.

*Uso:*
• .broadcast <messaggio>
• .bc <messaggio>

*Esempio:*
.broadcast Il bot verrà riavviato tra 5 minuti per manutenzione

_Il messaggio sarà inviato a tutti i gruppi con un delay di 2.5 secondi tra ogni invio per evitare ban._`)
    }
    
    const chats = Object.keys(global.db.data.chats || {})
    const groups = chats.filter(id => id.endsWith('@g.us'))
    
    if (groups.length === 0) {
        return m.reply('❌ Il bot non è in nessun gruppo!')
    }
    
    await m.reply(`📤 Invio broadcast a *${groups.length}* gruppi...\n\n⏱️ Tempo stimato: ~${Math.ceil(groups.length * 2.5 / 60)} minuti\n\n_Attendi..._`)
    
    const timestamp = new Date().toLocaleString('it-IT', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    })
    
    const message = `${text} `
    
    let sent = 0
    let failed = 0
    const failedGroups = []
    
    for (const groupId of groups) {
        try {
            await conn.sendMessage(groupId, { 
                text: message,
                contextInfo: {
                    externalAdReply: {
                        title: '📢 MESSAGGIO DA DIO',
                        body: 'Messaggio dal creatore del bot',
                        thumbnailUrl: 'https://telegra.ph/file/ba01cc1e5bd64ca9d65ef.jpg',
                        sourceUrl: '',
                        mediaType: 1,
                        renderLargerThumbnail: true
                    }
                }
            })
            sent++
            
            // Log successo
            try {
                const meta = await conn.groupMetadata(groupId)
                console.log(`✅ Broadcast inviato a: ${meta.subject}`)
            } catch (e) {
                console.log(`✅ Broadcast inviato a: ${groupId}`)
            }
            
            await new Promise(resolve => setTimeout(resolve, 2500)) // Delay 2.5 secondi
        } catch (e) {
            failed++
            failedGroups.push(groupId)
            console.error(`❌ Errore invio broadcast a ${groupId}:`, e.message)
            
            if (e.message.includes('rate') || e.message.includes('overlimit')) {
                console.log('⚠️ Rate limit rilevato, attendo 5 secondi...')
                await new Promise(resolve => setTimeout(resolve, 5000))
            }
        }
    }
    
    // Report finale
    let report = `✅ *BROADCAST COMPLETATO*\n\n`
    report += `📊 *Statistiche:*\n`
    report += `✔️ Inviati: *${sent}/${groups.length}*\n`
    report += `❌ Falliti: *${failed}*\n`
    report += `📈 Successo: *${Math.round((sent / groups.length) * 100)}%*\n`
    
    if (failed > 0 && failedGroups.length > 0) {
        report += `\n⚠️ *Gruppi falliti:*\n`
        for (let i = 0; i < Math.min(failedGroups.length, 5); i++) {
            try {
                const meta = await conn.groupMetadata(failedGroups[i])
                report += `• ${meta.subject}\n`
            } catch (e) {
                report += `• ${failedGroups[i]}\n`
            }
        }
        if (failedGroups.length > 5) {
            report += `_...e altri ${failedGroups.length - 5} gruppi_\n`
        }
    }
    
    await m.reply(report)
}

handler.command = /^(keys10)$/i

export default handler

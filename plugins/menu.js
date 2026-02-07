import fs from 'fs'
import path from 'path'

const delay = ms => new Promise(resolve => setTimeout(resolve, ms))

export default async function handler(m, { conn, isOwner }) {
    
    // ==================== CARICA IMMAGINE ====================
    const imagePath = path.join(process.cwd(), 'media', 'chatrank.jpeg')
    let imageBuffer = null
    
    try {
        if (fs.existsSync(imagePath)) {
            imageBuffer = fs.readFileSync(imagePath)
        }
    } catch (e) {
        console.error('Errore caricamento immagine chatrank:', e)
    }
    
    // ==================== MESSAGGIO MENU ====================
    const bodyText = ` ⋆｡˚『 📊 ╭ \`CHATRANK\` ╯ 』˚｡⋆

*Sistema di ranking e statistiche messaggi*

╭─『 👤 \`COMANDI UTENTE\` 』─╮

『 📊 』\`.myrank\`
     » Le tue statistiche personali
 
『 🏠 』\`.groupstats\`
     » Statistiche del gruppo

 ╭─『 🌍 \`COMANDI GLOBALI\` 』─╯

『 🏆 』\`.top gruppi\`
     » Top 10 gruppi più attivi

『 👑 』\`.top utenti\`
     » Top 10 utenti globali

『 🏆 』\`.sfide gruppi\`
     » Sfida giornaliera gruppi

『 👤 』\`.sfide utenti\`
     » Sfida giornaliera utenti

╰────────────╯

> Il bot conta automaticamente tutti i messaggi
> Usa i comandi per vedere le classifiche

_ChatRank by Chatunity_ 🚀`.trim()

    const interactiveMessage = {
        body: { 
            text: bodyText
        },
        footer: { 
            text: 'ChatRank by Chatunity 🚀' 
        },
        header: {
            hasMediaAttachment: imageBuffer ? true : false,
            ...(imageBuffer && {
                imageMessage: await conn.prepareMessage(m.chat, imageBuffer, 'imageMessage')
            })
        },
        nativeFlowMessage: {
            buttons: [
                {
                    name: 'cta_url',
                    buttonParamsJson: JSON.stringify({
                        display_text: '🌐 Visita Chatunity',
                        url: 'https://chatunity.it'
                    })
                },
                {
                    name: 'cta_url',
                    buttonParamsJson: JSON.stringify({
                        display_text: '📢 Segui il Canale',
                        url: 'https://whatsapp.com/channel/0029VaZVlJZHwXb8naJBQN0J'
                    })
                }
            ]
        }
    }

    await delay(300)
    
    // Se l'immagine non si carica nell'header, invia separatamente
    if (imageBuffer && !interactiveMessage.header.imageMessage) {
        // Invia immagine + messaggio interattivo separati
        await conn.sendMessage(m.chat, {
            image: imageBuffer,
            caption: bodyText
        }, { quoted: m })
        
        // Poi invia i button
        await conn.relayMessage(m.chat, {
            viewOnceMessage: {
                message: {
                    interactiveMessage: {
                        body: { text: '👇 *Link Utili*' },
                        footer: { text: 'ChatRank by Chatunity 🚀' },
                        header: { hasMediaAttachment: false },
                        nativeFlowMessage: interactiveMessage.nativeFlowMessage
                    }
                }
            }
        }, {})
    } else {
        // Invia messaggio interattivo normale
        await conn.relayMessage(m.chat, {
            viewOnceMessage: {
                message: {
                    interactiveMessage: interactiveMessage
                }
            }
        }, {})
    }
}

handler.help = ['chatrank', 'rankmenu', 'rankhelp']
handler.tags = ['rank']
handler.command = /^(chatrank|rankmenu|rankhelp|menurank|helprank)$/i

export { handler }

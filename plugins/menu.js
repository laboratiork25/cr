
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))


export default async function handler(m, { conn, isOwner }) {
   
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


╰────────────╯`.trim()


    const interactiveMessage = {
        body: {
            text: bodyText
        },
        footer: {
            text: 'ChatRank by Chatunity 🚀'
        },
        header: {
            hasMediaAttachment: false
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
    await conn.relayMessage(m.chat, {
        viewOnceMessage: {
            message: {
                interactiveMessage: interactiveMessage
            }
        }
    }, {})
}


handler.help = ['chatrank', 'rankmenu', 'rankhelp']
handler.tags = ['rank']
handler.command = /^(chatrank|rankmenu|rankhelp|menurank|helprank)$/i


export { handler }

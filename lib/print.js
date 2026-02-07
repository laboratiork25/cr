import chalk from 'chalk'
import { fileURLToPath } from 'url'

export default async function (m, conn = { user: {} }) {
  if (!m || m.key?.fromMe) return

  // Controlla se è comando
  const isCommand = m.text && /^[.!#]/.test(m.text)
  
  // Se non è comando, ignora (ChatRank conta tutti i messaggi in background)
  if (!isCommand) return

  try {
    const senderJid = conn.decodeJid ? conn.decodeJid(m.sender) : m.sender
    const chatJid = conn.decodeJid ? conn.decodeJid(m.chat || '') : (m.chat || '')
    
    let name = ''
    
    // Cache nome
    if (global.nameCache && global.nameCache.has(senderJid)) {
      name = global.nameCache.get(senderJid)
    } else if (conn.getName) {
      name = await conn.getName(senderJid)
      if (global.nameCache) global.nameCache.set(senderJid, name)
    } else {
      name = senderJid.split('@')[0]
    }
    
    // Formattazione chat
    let chat = ''
    if (m.isGroup) {
      let groupName = ''
      if (global.groupCache && global.groupCache.has(chatJid)) {
        const metadata = global.groupCache.get(chatJid)
        groupName = metadata?.subject || chatJid
      } else if (conn.groupMetadata) {
        try {
          const metadata = await conn.groupMetadata(chatJid)
          groupName = metadata?.subject || chatJid
          if (global.groupCache) global.groupCache.set(chatJid, metadata)
        } catch {
          groupName = chatJid
        }
      } else {
        groupName = chatJid
      }
      chat = chalk.cyan(groupName)
    } else {
      chat = chalk.blue('DM')
    }
    
    // Tipo e colore per comandi
    let type = chalk.green('CMD')
    
    // Testo
    let text = (m.text || '').substring(0, 70)
    if (m.text && m.text.length > 70) text += '...'
    
    // Log
    console.log(
      chalk.gray('[') + type + chalk.gray(']') +
      ' ' + chalk.magenta(name) +
      chalk.gray(' → ') + chat +
      chalk.gray(': ') + chalk.white(text)
    )
    
  } catch (e) {
    console.error('Print error:', e.message)
  }
}

let file = fileURLToPath(import.meta.url)
import { watchFile, unwatchFile } from 'fs'
watchFile(file, () => {
  unwatchFile(file)
  console.log(chalk.yellow('✓ print.js'))
  import(`${file}?update=${Date.now()}`)
})

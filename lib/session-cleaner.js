import { readdirSync, statSync, unlinkSync } from 'fs'
import { join } from 'path'
import chalk from 'chalk'

const SESSION_DIR = './s'
const MAX_AGE_MINUTES = 30 // File più vecchi di 30 minuti vengono eliminati
const CLEAN_INTERVAL = 10 * 60 * 1000 // Pulizia ogni 10 minuti

// File da non eliminare mai
const PROTECTED_FILES = [
    'creds.json',
    'app-state-sync-version-critical.json',
    'app-state-sync-key-main.json',
    'app-state-sync-key-undefined.json'
]

// Pattern file da proteggere (regex)
const PROTECTED_PATTERNS = [
    /^creds\.json$/,
    /^app-state-sync-key/,
    /^app-state-sync-version/,
    /^pre-key/
]

function isProtected(filename) {
    if (PROTECTED_FILES.includes(filename)) return true
    return PROTECTED_PATTERNS.some(pattern => pattern.test(filename))
}

function cleanOldSessions() {
    try {
        const now = Date.now()
        const maxAge = MAX_AGE_MINUTES * 60 * 1000
        
        const files = readdirSync(SESSION_DIR)
        let deleted = 0
        let kept = 0
        let totalSize = 0
        
        for (const file of files) {
            // Salta file protetti
            if (isProtected(file)) {
                kept++
                continue
            }
            
            const filePath = join(SESSION_DIR, file)
            
            try {
                const stats = statSync(filePath)
                
                // Salta directory
                if (stats.isDirectory()) {
                    kept++
                    continue
                }
                
                const age = now - stats.mtimeMs
                
                // Elimina se più vecchio di MAX_AGE_MINUTES
                if (age > maxAge) {
                    unlinkSync(filePath)
                    totalSize += stats.size
                    deleted++
                    
                    const ageMinutes = Math.floor(age / (60 * 1000))
                    if (deleted <= 5) { // Log solo primi 5 per non spammare
                        console.log(chalk.gray(`🗑️  ${file} (${ageMinutes}m)`))
                    }
                } else {
                    kept++
                }
            } catch (e) {
                // Ignora errori silenziosamente per non spammare console
            }
        }
        
        if (deleted > 0) {
            const sizeMB = (totalSize / (1024 * 1024)).toFixed(2)
            console.log(chalk.green(`✅ Pulizia: ${deleted} file | ${sizeMB} MB liberati | ${kept} mantenuti`))
        }
        
    } catch (error) {
        // Ignora errori silenziosamente
    }
}

// Pulizia immediata all'avvio
export function initSessionCleaner() {
    console.log(chalk.cyan(`🧹 Auto-pulizia sessioni attiva (ogni ${MAX_AGE_MINUTES}m | pulizia ogni 10 min)`))
    
    // Pulizia immediata
    cleanOldSessions()
    
    // Pulizia programmata
    setInterval(() => {
        cleanOldSessions()
    }, CLEAN_INTERVAL)
}

export default initSessionCleaner

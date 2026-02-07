process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = '1';
import './config.js';
import { createRequire } from 'module';
import path, { join } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { platform } from 'process';
import fs, { readdirSync, statSync, unlinkSync, existsSync, rmSync, watch } from 'fs';
import yargs from 'yargs';
import lodash from 'lodash';
const { chain } = lodash;
import chalk from 'chalk';
import { format } from 'util';
import pino from 'pino';
import { makeWASocket, protoType, serialize } from './lib/simple.js';
import { Low, JSONFile } from 'lowdb';
import NodeCache from 'node-cache';
import readline from 'readline';

const DisconnectReason = {
    connectionClosed: 428,
    connectionLost: 408,
    connectionReplaced: 440,
    timedOut: 408,
    loggedOut: 401,
    badSession: 500,
    restartRequired: 515,
    multideviceMismatch: 411,
    forbidden: 403,
    unavailableService: 503
};

const baileys = await import('@whiskeysockets/baileys');
const { useMultiFileAuthState, makeCacheableSignalKeyStore, Browsers, jidNormalizedUser } = baileys;
const makeInMemoryStore = baileys.makeInMemoryStore || baileys.default?.makeInMemoryStore;

protoType();
serialize();

global.__filename = function filename(pathURL = import.meta.url, rmPrefix = platform !== 'win32') {
    return rmPrefix ? /file:\/\/\//.test(pathURL) ? fileURLToPath(pathURL) : pathURL : pathToFileURL(pathURL).toString();
};

global.__dirname = function dirname(pathURL) {
    return path.dirname(global.__filename(pathURL, true));
};

global.__require = function require(dir = import.meta.url) {
    return createRequire(dir);
};

global.timestamp = { start: new Date };
const __dirname = global.__dirname(import.meta.url);
global.opts = new Object(yargs(process.argv.slice(2)).exitProcess(false).parse());
global.prefix = new RegExp('^[' + (opts['prefix'] || '*/!#$%+£¢€¥^°=¶∆×÷π√✓©®&.\\-.@').replace(/[|\\{}()[\]^$+*.\-\^]/g, '\\$&') + ']');

// Database ChatRank
global.db = new Low(new JSONFile('chatrank.json'));
global.DATABASE = global.db;

global.loadDatabase = async function loadDatabase() {
    if (global.db.READ) {
        return new Promise((resolve) => setInterval(async function () {
            if (!global.db.READ) {
                clearInterval(this);
                resolve(global.db.data == null ? global.loadDatabase() : global.db.data);
            }
        }, 1 * 1000));
    }
    if (global.db.data !== null) return;
    global.db.READ = true;
    await global.db.read().catch(console.error);
    global.db.READ = null;
    global.db.data = {
        users: {},
        chats: {},
        stats: {},
        settings: {},
        ...(global.db.data || {}),
    };
    global.db.chain = chain(global.db.data);
};
loadDatabase();

global.authFile = 's';

const { state, saveCreds } = await useMultiFileAuthState(global.authFile);
const msgRetryCounterCache = new NodeCache();

const groupMetadataCache = new NodeCache({ stdTTL: 7200, checkperiod: 600 });
global.groupCache = groupMetadataCache;

const logger = pino({ level: 'silent' });

global.jidCache = new NodeCache({ stdTTL: 14400, useClones: false });
global.nameCache = new NodeCache({ stdTTL: 14400, useClones: false });
global.store = makeInMemoryStore ? makeInMemoryStore({ logger }) : { loadMessage: async () => undefined };

// ==================== MENU INTERATTIVO ====================
function showMenu() {
    console.clear();
    console.log(chalk.cyan.bold('\n╔══════════════════════════════════╗'));
    console.log(chalk.cyan.bold('║      📊 CHATRANK BOT 📊         ║'));
    console.log(chalk.cyan.bold('╚══════════════════════════════════╝\n'));
    console.log(chalk.white('Seleziona modalità di avvio:\n'));
    console.log(chalk.green('  [1]') + chalk.white(' Avvio normale'));
    console.log(chalk.yellow('  [2]') + chalk.white(' Avvio + Notifica broadcast\n'));
    console.log(chalk.gray('Premi 1 o 2 e INVIO\n'));
}

async function getUserChoice() {
    return new Promise((resolve) => {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });

        showMenu();

        rl.on('line', (input) => {
            const choice = input.trim();
            if (choice === '1' || choice === '2') {
                rl.close();
                resolve(choice);
            } else {
                console.log(chalk.red('❌ Scegli 1 o 2\n'));
            }
        });
    });
}

const userChoice = await getUserChoice();
console.clear();

if (userChoice === '1') {
    console.log(chalk.green('✅ Avvio normale\n'));
} else {
    console.log(chalk.yellow('✅ Avvio con broadcast\n'));
}

global.sendBroadcast = userChoice === '2';
// ==================== FINE MENU ====================

const connectionOptions = {
    logger: logger,
    browser: Browsers.windows('Chrome'),
    auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, logger),
    },
    decodeJid: (jid) => {
        if (!jid) return jid;
        const cached = global.jidCache.get(jid);
        if (cached) return cached;
        let decoded = jid;
        if (/:\d+@/gi.test(jid)) {
            decoded = jidNormalizedUser(jid);
        }
        if (typeof decoded === 'object' && decoded.user && decoded.server) {
            decoded = `${decoded.user}@${decoded.server}`;
        }
        if (typeof decoded === 'string' && decoded.endsWith('@lid')) {
            decoded = decoded.replace('@lid', '@s.whatsapp.net');
        }
        global.jidCache.set(jid, decoded);
        return decoded;
    },
    printQRInTerminal: true,
    cachedGroupMetadata: async (jid) => {
        const cached = global.groupCache.get(jid);
        if (cached) return cached;
        try {
            const metadata = await global.conn.groupMetadata(global.conn.decodeJid(jid));
            global.groupCache.set(jid, metadata);
            return metadata;
        } catch (err) {
            return {};
        }
    },
    getMessage: async (key) => {
        try {
            const jid = global.conn.decodeJid(key.remoteJid);
            const msg = await global.store.loadMessage(jid, key.id);
            return msg?.message || undefined;
        } catch (error) {
            return undefined;
        }
    },
    msgRetryCounterCache,
    retryRequestDelayMs: 500,
    maxMsgRetryCount: 5,
};

global.conn = makeWASocket(connectionOptions);
global.store.bind(global.conn.ev);

conn.isInit = false;

// ==================== PULIZIA SESSIONI ====================
const SESSION_DIR = `./${global.authFile}`;
const MAX_AGE_MINUTES = 20;
const CLEAN_INTERVAL = 5 * 60 * 1000;

const PROTECTED_FILES = [
    'creds.json',
    'app-state-sync-version-critical.json',
    'app-state-sync-key-main.json',
    'app-state-sync-key-undefined.json'
];

const PROTECTED_PATTERNS = [
    /^creds\.json$/,
    /^app-state-sync-key/,
    /^app-state-sync-version/,
    /^pre-key/
];

function isProtected(filename) {
    if (PROTECTED_FILES.includes(filename)) return true;
    return PROTECTED_PATTERNS.some(pattern => pattern.test(filename));
}

function cleanOldSessions() {
    try {
        if (!existsSync(SESSION_DIR)) return;
        
        const now = Date.now();
        const maxAge = MAX_AGE_MINUTES * 60 * 1000;
        const files = readdirSync(SESSION_DIR);
        
        let deleted = 0;
        let totalSize = 0;
        
        for (const file of files) {
            if (isProtected(file)) continue;
            
            const filePath = join(SESSION_DIR, file);
            
            try {
                const stats = statSync(filePath);
                
                if (stats.isDirectory()) continue;
                
                const age = now - stats.mtimeMs;
                
                if (age > maxAge) {
                    unlinkSync(filePath);
                    totalSize += stats.size;
                    deleted++;
                }
            } catch (e) {}
        }
        
        if (deleted > 0) {
            const sizeMB = (totalSize / (1024 * 1024)).toFixed(2);
            console.log(chalk.gray(`🧹 ${deleted} file | ${sizeMB} MB`));
        }
        
    } catch (error) {}
}

console.log(chalk.cyan(`🧹 Pulizia sessioni attiva (>${MAX_AGE_MINUTES}m ogni 5min)`));
cleanOldSessions();

setInterval(() => {
    if (global.stopped === 'close' || !conn || !conn.user) return;
    cleanOldSessions();
}, CLEAN_INTERVAL);

// ==================== BROADCAST FUNCTION ====================
async function sendBroadcastMessage() {
    try {
        console.log(chalk.yellow('\n📡 Invio broadcast...'));
        
        const groups = Object.values(await conn.groupFetchAllParticipating());
        let success = 0;
        let failed = 0;
        
        const message = `📊 *CHATRANK ONLINE* 📊\n\n✅ Sistema di ranking messaggi attivo!\n\nUsa .rank per vedere la classifica 🏆`;
        
        for (const group of groups) {
            try {
                await conn.sendMessage(group.id, { text: message });
                success++;
                console.log(chalk.green(`✓ ${group.subject}`));
                await new Promise(resolve => setTimeout(resolve, 2000));
            } catch (e) {
                failed++;
                console.log(chalk.red(`✗ ${group.subject}`));
            }
        }
        
        console.log(chalk.cyan(`\n📊 Broadcast completato: ${success} ✓ | ${failed} ✗\n`));
    } catch (e) {
        console.error(chalk.red('Errore broadcast:'), e);
    }
}

// Database salvato ogni 5 minuti (più frequente per stats)
if (!opts['test']) {
    if (global.db) setInterval(async () => {
        if (global.db.data) await global.db.write();
    }, 5 * 60 * 1000);
}

async function connectionUpdate(update) {
    const { connection, lastDisconnect, isNewLogin } = update;
    global.stopped = connection;
    if (isNewLogin) conn.isInit = true;
    const code = lastDisconnect?.error?.output?.statusCode || lastDisconnect?.error?.output?.payload?.statusCode;
    
    if (code && code !== DisconnectReason.loggedOut && connection === 'close') {
        await global.reloadHandler(true).catch(console.error);
    }
    
    if (global.db.data == null) loadDatabase();
    
    if (connection === 'open') {
        console.log(chalk.green('✅ Connesso'));
        
        // Stats di avvio
        const groups = Object.keys(global.db.data?.chats || {}).filter(id => id.endsWith('@g.us'));
        const totalUsers = Object.keys(global.db.data?.users || {}).length;
        console.log(chalk.cyan(`📊 ${groups.length} gruppi | ${totalUsers} utenti tracciati`));
        
        if (global.sendBroadcast) {
            global.sendBroadcast = false;
            setTimeout(() => sendBroadcastMessage(), 3000);
        }
    }
    
    if (connection === 'close') {
        if (code === DisconnectReason.badSession) {
            console.log(chalk.red(`❌ Sessione invalida`));
            await global.reloadHandler(true).catch(console.error);
        } else if (code === DisconnectReason.connectionLost) {
            console.log(chalk.yellow('⚠️ Riconnessione...'));
            await global.reloadHandler(true).catch(console.error);
        } else if (code === DisconnectReason.loggedOut) {
            console.log(chalk.red('🚪 Logout - elimina cartella sessioni'));
            if (fs.existsSync(global.authFile)) {
                fs.rmSync(global.authFile, { recursive: true, force: true });
            }
            process.exit(1);
        } else if (code === DisconnectReason.restartRequired) {
            console.log(chalk.yellow('🔄 Restart richiesto'));
            await global.reloadHandler(true).catch(console.error);
        } else if (code === DisconnectReason.timedOut) {
            console.log(chalk.yellow('⏱️ Timeout'));
            await global.reloadHandler(true).catch(console.error);
        }
    }
}

process.on('uncaughtException', (err) => {
    console.error(chalk.red('Uncaught:'), err);
});

process.on('unhandledRejection', (err) => {
    console.error(chalk.red('Unhandled:'), err);
});

conn.ev.on('connection.update', connectionUpdate);
conn.ev.on('creds.update', saveCreds);

let isInit = true;
let handler = await import('./handler.js');

global.reloadHandler = async function (restatConn) {
    try {
        const Handler = await import(`./handler.js?update=${Date.now()}`).catch(console.error);
        if (Object.keys(Handler || {}).length) handler = Handler;
    } catch (e) {
        console.error(e);
    }
    if (restatConn) {
        try {
            global.conn.ws.close();
        } catch { }
        conn.ev.removeAllListeners();
        global.conn = makeWASocket(connectionOptions);
        global.store.bind(global.conn.ev);
        isInit = true;
    }
    if (!isInit) {
        conn.ev.off('messages.upsert', conn.handler);
        conn.ev.off('connection.update', conn.connectionUpdate);
        conn.ev.off('creds.update', conn.credsUpdate);
    }
    conn.handler = handler.handler.bind(global.conn);
    conn.connectionUpdate = connectionUpdate.bind(global.conn);
    conn.credsUpdate = saveCreds;
    conn.ev.on('messages.upsert', conn.handler);
    conn.ev.on('connection.update', conn.connectionUpdate);
    conn.ev.on('creds.update', conn.credsUpdate);
    isInit = false;
    return true;
};

const pluginFolder = global.__dirname(join(__dirname, './plugins/index'));
const pluginFilter = (filename) => /\.js$/.test(filename);
global.plugins = {};

async function filesInit() {
    for (const filename of readdirSync(pluginFolder).filter(pluginFilter)) {
        try {
            const file = global.__filename(join(pluginFolder, filename));
            const module = await import(file);
            global.plugins[filename] = module.default || module;
        } catch (e) {
            conn.logger.error(e);
            delete global.plugins[filename];
        }
    }
}

filesInit().then((_) => Object.keys(global.plugins)).catch(console.error);

global.reload = async (_ev, filename) => {
    if (pluginFilter(filename)) {
        const dir = global.__filename(join(pluginFolder, filename), true);
        if (filename in global.plugins) {
            if (existsSync(dir)) conn.logger.info(chalk.green(`✅ '${filename}'`));
            else {
                conn.logger.warn(`🗑️ '${filename}'`);
                return delete global.plugins[filename];
            }
        } else conn.logger.info(`🆕 '${filename}'`);
        
        try {
            const module = (await import(`${global.__filename(dir)}?update=${Date.now()}`));
            global.plugins[filename] = module.default || module;
        } catch (e) {
            conn.logger.error(`❌ ${filename}: ${format(e)}`);
        } finally {
            global.plugins = Object.fromEntries(Object.entries(global.plugins).sort(([a], [b]) => a.localeCompare(b)));
        }
    }
};

Object.freeze(global.reload);
const pluginWatcher = watch(pluginFolder, global.reload);
await global.reloadHandler();

let filePath = fileURLToPath(import.meta.url);
const mainWatcher = watch(filePath, async () => {
    console.log(chalk.magenta("⚡ Riavvio..."));
});
await global.reloadHandler(true).catch(console.error);

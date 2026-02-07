import { watchFile, unwatchFile } from 'fs'
import { fileURLToPath, pathToFileURL } from 'url'
import chalk from 'chalk'
import fs from 'fs'
import * as cheerio from 'cheerio'
import fetch from 'node-fetch'
import axios from 'axios'
import moment from 'moment-timezone'
import NodeCache from 'node-cache'

const pkg = JSON.parse(fs.readFileSync('./package.json', 'utf-8'))
const moduleCache = new NodeCache({ stdTTL: 300 });

global.owner = [
  ['393520570672', 'vale', true],

]

global.cheerio = cheerio
global.fs = fs
global.fetch = fetch
global.axios = axios
global.moment = moment

let filePath = fileURLToPath(import.meta.url)
let fileUrl = pathToFileURL(filePath).href
const reloadConfig = async () => {
  const cached = moduleCache.get(fileUrl);
  if (cached) return cached;
  unwatchFile(filePath)
  console.log(chalk.bgHex('#3b0d95')(chalk.white.bold("File: 'config.js' Aggiornato")))
  const module = await import(`${fileUrl}?update=${Date.now()}`)
  moduleCache.set(fileUrl, module, { ttl: 300 });
  return module;
}
watchFile(filePath, reloadConfig)
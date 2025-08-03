const { makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, makeCacheableSignalKeyStore, makeInMemoryStore } = require('@whiskeysockets/baileys')
const { Boom } = require('@hapi/boom')
const inquirer = require('inquirer')
const fs = require('fs-extra')
const chalk = require('chalk')
const figlet = require('figlet')
const path = require('path')

const store = makeInMemoryStore({ logger: undefined })
const authDir = './auth_info'

async function startFaruqCLI() {
    console.clear()
    console.log(chalk.green(figlet.textSync('faruqCLI', { horizontalLayout: 'full' })))

    const { state, saveCreds } = await useMultiFileAuthState(authDir)
    const { version } = await fetchLatestBaileysVersion()

    const socket = makeWASocket({
        version,
        printQRInTerminal: false,
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, undefined)
        },
        browser: ['FaruqCLI', 'Chrome', '1.0.0'],
        markOnlineOnConnect: true
    })

    store.bind(socket.ev)

    socket.ev.on('creds.update', saveCreds)

    socket.ev.on('connection.update', async ({ connection, lastDisconnect, isNewLogin, qr, pairingCode }) => {
        if (connection === 'open') {
            console.log(chalk.green('[✅] Terhubung ke WhatsApp!\n'))
            await mainMenu(socket)
        }

        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut
            console.log(chalk.red('[❌] Koneksi terputus.'), lastDisconnect?.error)
            if (shouldReconnect) {
                startFaruqCLI()
            }
        }

        if (pairingCode) {
            console.log(chalk.yellow('\n[📲] Gunakan Kode Pairing Ini di WhatsApp:'))
            console.log(chalk.cyanBright(`[ ${pairingCode} ]`))
            console.log(chalk.white('Buka WhatsApp > Perangkat Tertaut > Tautkan Perangkat'))
        }
    })

    socket.ev.on('messages.upsert', ({ messages }) => {
        const msg = messages[0]
        if (!msg.key.fromMe) {
            const sender = msg.pushName || msg.key.remoteJid
            const text = msg.message?.conversation || msg.message?.extendedTextMessage?.text || '[Media]'
            console.log(chalk.blue(`\n📩 Pesan Baru dari ${sender}: ${text}`))
        }
    })
}

async function mainMenu(sock) {
    const chats = await sock.chatReadAll()
    const chatList = Object.values(sock.chats || {}).filter(c => c?.id.endsWith('@s.whatsapp.net') || c?.id.endsWith('@g.us'))

    const choices = chatList.map((c, i) => ({
        name: `${c.name || c.id} ${c.unreadCount ? `(${c.unreadCount} pesan belum dibaca)` : ''}`,
        value: c.id
    }))

    const { selectedChat } = await inquirer.prompt([{
        type: 'list',
        name: 'selectedChat',
        message: '📥 Pilih chat untuk dibuka:',
        choices
    }])

    const { message } = await inquirer.prompt([{
        type: 'input',
        name: 'message',
        message: `Ketik pesan untuk ${selectedChat.split('@')[0]}:`
    }])

    await sock.sendMessage(selectedChat, { text: message })
    console.log(chalk.green('✅ Pesan terkirim!\n'))

    setTimeout(() => mainMenu(sock), 1000)
}

startFaruqCLI()
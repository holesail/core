const testnet = require('hyperdht/testnet.js')
const net = require('net')
const dgram = require('dgram')
const Holesail = require('../index.js')

// Small local DHT swarm bootstrapped off of loopback nodes instead of the
// public network, so tests are fast, deterministic, and offline.
async function createTestnet(t, size = 30) {
  return testnet(size, { teardown: t.teardown })
}

async function startServer(t, testnet, opts = {}) {
  const server = new Holesail({
    server: true,
    host: '127.0.0.1',
    bootstrap: testnet.bootstrap,
    ...opts
  })
  t.teardown(() => server.close())
  await server.ready()
  return server
}

async function startClient(t, testnet, server, opts = {}) {
  const client = new Holesail({
    invite: server.info.invite,
    bootstrap: testnet.bootstrap,
    port: 0,
    host: '127.0.0.1',
    udp: false,
    ...opts
  })
  t.teardown(() => client.close())
  await client.ready()
  return client
}

function tcpEchoServer(t) {
  return new Promise((resolve, reject) => {
    const sockets = new Set()
    const server = net.createServer({ allowHalfOpen: true }, (sock) => {
      sockets.add(sock)
      sock.on('close', () => sockets.delete(sock))
      sock.on('data', (d) => sock.write(d))
    })
    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => {
      // server.close() only stops accepting new connections, so destroy the
      // already-accepted sockets too or they linger for the whole run.
      t.teardown(() => {
        for (const sock of sockets) sock.destroy()
        server.close()
      })
      resolve(server)
    })
  })
}

function udpEchoServer(t) {
  return new Promise((resolve, reject) => {
    const server = dgram.createSocket('udp4')
    server.on('message', (msg, rinfo) => {
      server.send(msg, 0, msg.length, rinfo.port, rinfo.address)
    })
    server.on('error', reject)
    server.bind(0, '127.0.0.1', () => {
      t.teardown(() => server.close())
      resolve(server)
    })
  })
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address()
      server.close(() => resolve(port))
    })
  })
}

function connectLocal(port, host = '127.0.0.1') {
  return new Promise((resolve, reject) => {
    const socket = net.connect(port, host)
    socket.once('connect', () => resolve(socket))
    socket.once('error', reject)
  })
}

function readOnce(stream) {
  return new Promise((resolve, reject) => {
    stream.once('data', (d) => resolve(d))
    stream.once('error', reject)
  })
}

function bindUdpClient(t) {
  return new Promise((resolve, reject) => {
    const socket = dgram.createSocket('udp4')
    socket.on('error', reject)
    socket.bind(0, '127.0.0.1', () => {
      t.teardown(() => socket.close())
      resolve(socket)
    })
  })
}

function udpSend(socket, port, host, payload) {
  return new Promise((resolve, reject) => {
    socket.send(payload, 0, payload.length, port, host, (err) => (err ? reject(err) : resolve()))
  })
}

function udpReceiveOnce(socket) {
  return new Promise((resolve, reject) => {
    socket.once('message', (msg) => resolve(msg))
    socket.once('error', reject)
  })
}

function waitForEvent(emitter, event) {
  return new Promise((resolve) => emitter.once(event, (...args) => resolve(args[0])))
}

function createLogger() {
  const calls = { debug: [], info: [], warn: [], error: [] }
  const logger = {
    debug: (...a) => calls.debug.push(a),
    info: (...a) => calls.info.push(a),
    warn: (...a) => calls.warn.push(a),
    error: (...a) => calls.error.push(a)
  }
  return { logger, calls }
}

module.exports = {
  createTestnet,
  startServer,
  startClient,
  tcpEchoServer,
  udpEchoServer,
  getFreePort,
  connectLocal,
  readOnce,
  bindUdpClient,
  udpSend,
  udpReceiveOnce,
  waitForEvent,
  createLogger
}

const test = require('brittle')
const HyperDHT = require('hyperdht')
const HolesailServer = require('holesail-server')
const HolesailClient = require('holesail-client')
const { randomSeed, parse } = require('@holesail/invite')
const Holesail = require('../index.js')
const {
  createTestnet,
  startServer,
  startClient,
  tcpEchoServer,
  getFreePort,
  connectLocal,
  waitForEvent,
  createLogger
} = require('./helpers.js')

test('constructor - defaults to client mode', async (t) => {
  const hs = new Holesail({ invite: 'hs_bogus' })

  t.is(hs.server, false)
  t.is(hs.client, true)
  t.is(hs.invite, 'hs_bogus')
  t.is(hs.proxy, null)
  t.is(hs.running, false)
})

test('constructor - server mode only when opts.server is strictly true', async (t) => {
  t.is(new Holesail({ server: 1 }).server, false)
  t.is(new Holesail({ server: 'yes' }).server, false)

  const hs = new Holesail({ server: true })
  t.is(hs.server, true)
  t.is(hs.client, false)
})

test('constructor - keeps port/host/udp/seed/bootstrap as given', async (t) => {
  const seed = randomSeed()
  const bootstrap = [{ host: '127.0.0.1', port: 49737 }]
  const hs = new Holesail({ server: true, port: 8080, host: '0.0.0.0', udp: true, seed, bootstrap })

  t.is(hs.port, 8080)
  t.is(hs.host, '0.0.0.0')
  t.is(hs.udp, true)
  t.is(hs.seed, seed)
  t.is(hs.bootstrap, bootstrap)
})

test('randomSeed() - returns a fresh seed every call', async (t) => {
  const a = Holesail.randomSeed()
  const b = Holesail.randomSeed()

  t.is(typeof a, 'string')
  t.ok(a.length > 0)
  t.not(a, b)
})

test('server - ready() starts a HolesailServer that is listening', async (t) => {
  const testnet = await createTestnet(t)
  const server = await startServer(t, testnet, { port: 1 })

  t.ok(server.proxy instanceof HolesailServer)
  t.is(server.running, true)
  t.is(server.info.state, 'listening')
  t.is(server.info.server, true)
  t.is(server.info.client, false)
  t.ok(server.info.invite.startsWith('hs_'), 'exposes an invite')
})

test('server - emits listening exactly once', async (t) => {
  const testnet = await createTestnet(t)
  const server = new Holesail({
    server: true,
    port: 1,
    host: '127.0.0.1',
    bootstrap: testnet.bootstrap
  })
  t.teardown(() => server.close())

  let count = 0
  server.on('listening', () => count++)

  await server.ready()
  t.is(count, 1)
})

test('server - same seed always produces the same invite', async (t) => {
  const testnet = await createTestnet(t)
  const seed = randomSeed()

  const a = await startServer(t, testnet, { port: 1, seed })
  const invite = a.info.invite
  await a.close()

  const b = await startServer(t, testnet, { port: 1, seed })
  t.is(b.info.invite, invite)
  t.is(b.info.seed, seed)
})

test('server - info.seed is exposed even when no seed was given', async (t) => {
  const testnet = await createTestnet(t)
  const a = await startServer(t, testnet, { port: 1 })

  const { seed, invite } = a.info
  t.ok(/^[0-9a-f]{64}$/.test(seed), 'generated seed is exposed as hex')
  await a.close()

  const b = await startServer(t, testnet, { port: 1, seed })
  t.is(b.info.invite, invite, 'reusing info.seed restores the same invite')
})

test('client - info does not expose a seed', async (t) => {
  const testnet = await createTestnet(t)
  const echo = await tcpEchoServer(t)
  const server = await startServer(t, testnet, { port: echo.address().port })
  const client = await startClient(t, testnet, server)

  t.absent('seed' in client.info)
})

test('probe() - resolves the port/host/udp advertised by the server', async (t) => {
  const testnet = await createTestnet(t)
  const server = await startServer(t, testnet, { port: 1234, udp: true })

  const dht = new HyperDHT({ bootstrap: testnet.bootstrap })
  t.teardown(() => dht.destroy())

  const result = await Holesail.probe(server.info.invite, dht)

  t.is(result.port, 1234)
  t.is(result.host, '127.0.0.1')
  t.is(result.udp, true)
})

test('probe() - leaves a supplied dht alive and reusable', async (t) => {
  const testnet = await createTestnet(t)
  const server = await startServer(t, testnet, { port: 1 })

  const dht = new HyperDHT({ bootstrap: testnet.bootstrap })
  t.teardown(() => dht.destroy())

  await Holesail.probe(server.info.invite, dht)
  t.is(dht.destroyed, false)

  const result = await Holesail.probe(server.info.invite, dht)
  t.is(result.port, 1, 'second probe on the same dht still works')
})

test('server - info reflects port/host/udp', async (t) => {
  const testnet = await createTestnet(t)
  const server = await startServer(t, testnet, { port: 1234, udp: true })

  const info = server.info
  t.is(info.port, 1234)
  t.is(info.host, '127.0.0.1')
  t.is(info.udp, true)
})

test('server - custom logger is passed through to the underlying server', async (t) => {
  const testnet = await createTestnet(t)
  const { logger, calls } = createLogger()
  await startServer(t, testnet, { port: 1, logger })

  t.ok(calls.info.length > 0, 'custom logger received info calls during startup')
})

test('client - ready() throws when no invite is given', async (t) => {
  const hs = new Holesail({ bootstrap: false })
  await t.exception(() => hs.ready(), /Invite can not be null or undefined/)
})

test('client - ready() starts a HolesailClient that is listening locally', async (t) => {
  const testnet = await createTestnet(t)
  const echo = await tcpEchoServer(t)
  const server = await startServer(t, testnet, { port: echo.address().port })
  const client = await startClient(t, testnet, server)

  t.ok(client.proxy instanceof HolesailClient)
  t.is(client.running, true)
  t.ok(client.proxy.proxy, 'local proxy is bound')

  const info = client.info
  t.is(info.state, 'listening')
  t.is(info.server, false)
  t.is(info.client, true)
  t.is(info.invite, server.info.invite)
  t.is(info.host, '127.0.0.1')
  t.is(info.udp, false)
})

test('client - emits listening exactly once', async (t) => {
  const testnet = await createTestnet(t)
  const echo = await tcpEchoServer(t)
  const server = await startServer(t, testnet, { port: echo.address().port })

  const client = new Holesail({
    invite: server.info.invite,
    bootstrap: testnet.bootstrap,
    port: 0,
    host: '127.0.0.1',
    udp: false
  })
  t.teardown(() => client.close())

  let count = 0
  client.on('listening', () => count++)

  await client.ready()
  t.is(count, 1)
})

test('client - probes the server when port/host/udp are not supplied', async (t) => {
  const testnet = await createTestnet(t)
  // The client's local port mirrors the probed port and both live on
  // 127.0.0.1 here, so advertise a free port distinct from any real listener.
  const port = await getFreePort()
  const server = await startServer(t, testnet, { port })

  const client = new Holesail({
    invite: server.info.invite,
    bootstrap: testnet.bootstrap
  })
  t.teardown(() => client.close())
  await client.ready()

  t.is(client.info.port, port)
  t.is(client.info.host, '127.0.0.1')
  t.is(client.info.udp, false)
})

test('client - invite targets the server public key', async (t) => {
  const testnet = await createTestnet(t)
  const server = await startServer(t, testnet, { port: 1 })

  const { publicKey } = parse(server.info.invite)
  t.alike(publicKey, server.proxy.keyPair.publicKey)
})

test('events - connect on the client and connection on the server per tunnel', async (t) => {
  const testnet = await createTestnet(t)
  const echo = await tcpEchoServer(t)
  const server = await startServer(t, testnet, { port: echo.address().port })
  const client = await startClient(t, testnet, server)

  const connect = waitForEvent(client, 'connect')
  const connection = waitForEvent(server, 'connection')

  const local = client.proxy.proxy.address()
  const socket = await connectLocal(local.port, local.address)
  t.teardown(() => socket.destroy())

  await connect
  t.pass('client emitted connect')
  await connection
  t.pass('server emitted connection')
})

test('ready() - is idempotent', async (t) => {
  const testnet = await createTestnet(t)
  const server = await startServer(t, testnet, { port: 1 })
  const proxy = server.proxy

  await server.ready()
  t.is(server.proxy, proxy, 'no second proxy was created')
})

test('pause()/resume() - server transitions state', async (t) => {
  const testnet = await createTestnet(t)
  const server = await startServer(t, testnet, { port: 1 })

  await server.pause()
  t.is(server.info.state, 'paused')

  await server.resume()
  t.is(server.info.state, 'listening')
})

test('pause()/resume() - client transitions state', async (t) => {
  const testnet = await createTestnet(t)
  const echo = await tcpEchoServer(t)
  const server = await startServer(t, testnet, { port: echo.address().port })
  const client = await startClient(t, testnet, server)

  await client.pause()
  t.is(client.info.state, 'paused')

  await client.resume()
  t.is(client.info.state, 'listening')
})

test('close() - tears down the server', async (t) => {
  const testnet = await createTestnet(t)
  const server = await startServer(t, testnet, { port: 1 })

  await server.close()

  t.is(server.running, false)
  t.ok(server.closed, 'ReadyResource marks the instance closed')
  t.is(server.info.state, 'destroyed')
})

test('close() - tears down the client and stops accepting local connections', async (t) => {
  const testnet = await createTestnet(t)
  const echo = await tcpEchoServer(t)
  const server = await startServer(t, testnet, { port: echo.address().port })
  const client = await startClient(t, testnet, server)

  const local = client.proxy.proxy.address()
  await client.close()

  t.is(client.running, false)
  t.ok(client.closed, 'ReadyResource marks the instance closed')
  t.is(client.info.state, 'destroyed')
  await t.exception(async () => connectLocal(local.port, local.address))
})

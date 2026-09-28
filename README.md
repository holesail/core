# @holesail/core

P2P core behind the Holesail CLI. Reverse proxy a local port peer-to-peer to anyone with an invite, over HyperDHT.

```
npm install @holesail/core
```

Works in Node.js and Bare.

## Usage

On the machine running the service

```js
const Holesail = require('@holesail/core')

const server = new Holesail({ server: true, port: 8080, host: '127.0.0.1' })
await server.ready()

console.log(server.info.invite) // hs_...
```

On the machine that wants to reach it

```js
const Holesail = require('@holesail/core')

const client = new Holesail({ invite: 'hs_...' })
await client.ready()

// 127.0.0.1:8080 now tunnels to the server's port 8080
```

The client asks the server for its port, host and protocol when you don't pass them.

## API

#### `const hs = new Holesail([options])`

Make a new Holesail server or client. Options include

```js
{
  server: false, // set to true to run a server, otherwise it's a client
  port: 8080, // server: local port to expose. client: local port to listen on
  host: '127.0.0.1', // server: local host to expose. client: local host to bind to
  udp: false, // tunnel udp instead of tcp
  seed: '<hex>', // server only: 64 char hex seed, same seed gives the same invite
  invite: 'hs_...', // client only: invite of the server to connect to
  bootstrap: [], // custom dht bootstrap nodes, defaults to the public network
  logger: null // optional { debug, info, warn, error } logger
}
```

As a client, `port`, `host` and `udp` default to what the server advertises. Pass all three to skip that lookup.

If `seed` isn't set, the server makes a random one. Read it back from `hs.info.seed` and save it to keep the same invite across restarts.

#### `await hs.ready()`

Start the server or client. Resolves when it is listening.

#### `await hs.close()`

Shut it down and close all tunnels.

#### `await hs.pause()`

Suspend the underlying DHT, for example when the app goes to the background.

#### `await hs.resume()`

Resume after a pause.

#### `hs.info`

Object describing the current state.

```js
{
  server: true, // true if running as a server
  client: false, // true if running as a client
  state: 'listening', // 'listening', 'paused' or 'destroyed'
  port: 8080,
  host: '127.0.0.1',
  udp: false,
  invite: 'hs_...',
  seed: '<hex>' // server only
}
```

#### `hs.proxy`

The underlying [holesail-server](https://github.com/holesail/holesail-server) or [holesail-client](https://github.com/holesail/holesail-client) instance.

#### `hs.on('listening')`

Emitted when the server or client is listening.

#### `hs.on('connection')`

Emitted on the server when a peer connects.

#### `hs.on('connect')`

Emitted on the client when it opens a new tunnel to the server, once per local connection.

#### `const { port, host, udp } = await Holesail.probe(invite, [dht])`

Ask a server what it is exposing without opening a tunnel. Pass your own [hyperdht](https://github.com/holepunchto/hyperdht) instance to reuse it, otherwise a temporary one is made.

#### `const seed = Holesail.randomSeed()`

Make a new random 64 char hex seed.

## License

AGPL-3.0

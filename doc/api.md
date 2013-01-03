# API

## Classes

### mineflayer.Vec3

See [superjoe30/node-vec3](https://github.com/superjoe30/node-vec3)

All points in mineflayer are supplied as instances of this class.

 * x - south
 * y - up
 * z - west

## Bot

### Properties

#### bot.username

#### bot.entity

Looks like:
```js
{
  type: 'namedPlayer',
  id: 234,
  position: {
    pos: new Vec3(0, 0, 0),
    vel: new Vec3(0, 0, 0),
    height: 1.74,
    yaw: 0.56,
    pitch: 1.2,
    onGround: true,
  },
  username: bot.username,
  heldItem: null,
  effects: {},
}
```

### Events

#### "chat" (username, message, rawMessage)

 * `username` - who said the message
 * `message` - stripped of any control characters
 * `rawMessage` - unmodified message from the server

#### "nonSpokenChat" (message, rawMessage)

 * `message` - stripped of all control characters
 * `rawMessage` - unmodified message from the server

#### "selfMoved"

Occurs when you move. See also `Bot.entity`.

### Methods

#### chat(message)

Sends a publicly broadcast chat message. Breaks up big messages into
multiple chat messages as necessary. If message begins with
"/tell <username> ", then all split messages will be whispered as well.

#### setControlState(control, state)

Sets the input state of a control. Use this to move around, jump, and
place and activate blocks. It is as if you are virtually pressing keys
on a keyboard. Your actions will be bound by the physics engine.

 * `control` - one of `forward`, `back`, `right`, `left`, `jump`.
 * `state` - boolean - whether or not you are activating this control.
   e.g. whether or not the virtual button is held down.

#### clearControlStates()

Sets all control states to false.

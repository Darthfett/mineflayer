var Vec3 = require('vec3').Vec3
  , assert = require('assert').Vec3

module.exports = inject;

var EPSILON = 0.000001
  , PI = Math.PI
  , PI_2 = Math.PI * 2
  , POSITION_UPDATE_INTERVAL_MS = 50

function inject(bot) {
  var physics = {
    maxGroundSpeed: 4.27, // according to the internet
    terminalVelocity: 20.0, // guess
    walkingAcceleration: 100.0, // seems good
    gravity: 27.0, // seems good
    groundFriction: 0.9, // seems good
    playerApothem: 0.32, // notch's client F3 says 0.30, but that caused spankings
    playerHeight: 1.74, // tested with a binary search
    jumpSpeed: 9.0, // seems good
    yawSpeed: 3.0, // seems good
  };

  var entity = {
    type: 'namedPlayer',
    id: null,
    position: {
      pos: new Vec3(0, 0, 0),
      vel: new Vec3(0, 0, 0),
      height: null,
      yaw: null,
      pitch: null,
      onGround: null,
    },
    username: bot.username,
    heldItem: null,
    effects: {},
  };

  var controlState = {
    forward: false,
    back: false,
    left: false,
    right: false,
    jump: false,
  };
  var jumpWasPressed = false;
  var lastSentYaw = null;
  var positionUpdateTimer = null;

  function doPhysics(deltaSeconds) {
    if (deltaSeconds < EPSILON) return; // too fast

    // derive xy movement vector from controls
    var movementRight = 0;
    if (controlState.right) movementRight += 1;
    if (controlState.left) movementRight -= 1;
    var movementForward = 0;
    if (controlState.forward) movementForward += 1;
    if (controlState.back) movementForward -= 1;

    // acceleration is m/s/s
    var acceleration = new Vec3(0, 0, 0);
    if (movementForward || movementRight) {
      // input acceleration
      var rotationFromInput = Math.atan2(-movementRight, movementForward);
      var inputYaw = entity.position.yaw + rotationFromInput;
      acceleration.x += physics.walkingAcceleration * -Math.sin(inputYaw);
      acceleration.z += physics.walkingAcceleration * -Math.cos(inputYaw);
    }

    // jumping
    if ((controlState.jump || jumpWasPressed) && entity.position.onGround) entity.position.vel.y = physics.jumpSpeed;
    jumpWasPressed = false;

    // gravity
    acceleration.y -= physics.gravity;

    var oldGroundSpeedSquared = calcGroundSpeedSquared();
    if (oldGroundSpeedSquared < EPSILON) {
      // stopped
      entity.position.vel.x = 0;
      entity.position.vel.z = 0;
    } else {
      // non-zero ground speed
      var oldGroundSpeed = Math.sqrt(oldGroundSpeedSquared);
      var groundFriction = physics.groundFriction * physics.walkingAcceleration;
      // half friction for air
      if (! entity.position.onGround) groundFriction *= 0.05;
      // if friction would stop the motion, do it
      var maybeNewGroundFriction = oldGroundSpeed / deltaSeconds;
      groundFriction = groundFriction > maybeNewGroundFriction ? maybeNewGroundFriction : groundFriction;
      acceleration.x -= entity.position.vel.x / oldGroundSpeed * groundFriction;
      acceleration.z -= entity.position.vel.z / oldGroundSpeed * groundFriction;
    }

    // calculate new speed
    entity.position.vel.add(acceleration.scaled(deltaSeconds))

    // limit speed
    var groundSpeedSquared = calcGroundSpeedSquared();
    if (groundSpeedSquared > physics.maxGroundSpeed * physics.maxGroundSpeed) {
      var groundSpeed = Math.sqrt(groundSpeedSquared);
      var correctionScale = physics.maxGroundSpeed / groundSpeed;
      entity.position.vel.x *= correctionScale;
      entity.position.vel.z *= correctionScale;
    }
    entity.position.vel.y = entity.position.vel.y < -physics.terminalVelocity ? -physics.terminalVelocity : entity.position.vel.y;
    entity.position.vel.y = entity.position.vel.y > physics.terminalVelocity ? physics.terminalVelocity : entity.position.vel.y;

    // calculate new positions and resolve collisions
    var boundingBox = getBoundingBox();
    if (entity.position.vel.x !== 0) {
      entity.position.pos.x += entity.position.vel.x * deltaSeconds;
      var blockX = Math.floor(entity.position.pos.x + sign(entity.position.vel.x) * physics.playerApothem);
      if (collisionInRange(new Vec3(blockX, boundingBox.min.y, boundingBox.min.z), new Vec3(blockX, boundingBox.max.y, boundingBox.max.z))) {
        entity.position.pos.x = blockX + (entity.position.vel.x < 0 ? 1 + physics.playerApothem : -physics.playerApothem) * 1.001;
        entity.position.vel.x = 0;
        boundingBox = getBoundingBox();
      }
    }

    if (entity.position.vel.z !== 0) {
      entity.position.pos.z += entity.position.vel.z * deltaSeconds;
      var blockZ = Math.floor(entity.position.pos.z + sign(entity.position.vel.z) * physics.playerApothem);
      if (collisionInRange(new Vec3(boundingBox.min.x, boundingBox.min.y, blockZ), new Vec3(boundingBox.max.x, boundingBox.max.y, blockZ))) {
        entity.position.pos.z = blockZ + (entity.position.vel.z < 0 ? 1 + physics.playerApothem : -physics.playerApothem) * 1.001;
        entity.position.vel.z = 0;
        boundingBox = getBoundingBox();
      }
    }

    entity.position.onGround = false;
    if (entity.position.vel.y !== 0) {
      entity.position.pos.y += entity.position.vel.y * deltaSeconds;
      var playerHalfHeight = physics.playerHeight / 2;
      var blockY = Math.floor(entity.position.pos.y + playerHalfHeight + sign(entity.position.vel.y) * playerHalfHeight);
      if (collisionInRange(new Vec3(boundingBox.min.x, blockY, boundingBox.min.z), new Vec3(boundingBox.max.x, blockY, boundingBox.max.z))) {
        entity.position.pos.y = blockY + (entity.position.vel.y < 0 ? 1 : -physics.playerHeight) * 1.001;
        entity.position.onGround = entity.position.vel.y < 0 ? true : entity.position.onGround;
        entity.position.vel.y = 0;
      }
    }

    bot.emit('selfMoved');
  }

  function collisionInRange(boundingBoxMin, boundingBoxMax) {
    // TODO: check partial blocks
    var cursor = new Vec3(0, 0, 0);
    for (cursor.x = boundingBoxMin.x; cursor.x <= boundingBoxMax.x; cursor.x++) {
      for (cursor.y = boundingBoxMin.y; cursor.y <= boundingBoxMax.y; cursor.y++) {
        for (cursor.z = boundingBoxMin.z; cursor.z <= boundingBoxMax.z; cursor.z++) {
          if (blockAt(cursor).physical) return true;
        }
      }
    }

    return false;
  }

  function calcGroundSpeedSquared() {
    var vel = entity.position.vel;
    return vel.x * vel.x + vel.y * vel.y;
  }

  function getBoundingBox() {
    var pos = entity.position.pos;
    return {
      min: new Vec3(
        pos.x - physics.playerApothem,
        pos.y,
        pos.z - physics.playerApothem
      ).floor(),
      max: new Vec3(
        pos.x + physics.playerApothem,
        pos.y + physics.playerHeight,
        pos.z + physics.playerApothem
      ).floor(),
    };
  }

  function sign(n) {
    return n > 0 ?  1 : n < 0 ?  -1 : 0;
  }

  function degreesToRadians(degrees) {
    return degrees / 180 * PI;
  }

  function sendPositionAndLook(position) {
    // sends data, no logic
    var packet = {
      x: position.pos.x,
      y: position.pos.y,
      z: position.pos.z,
      stance: position.height + position.pos.y,
      onGround: position.onGround,
    };
    toNotchianYawPitch(position, packet);
    bot.client.writePacket(0x0d, packet);
  }

  function sendPosition() {
    // increment the yaw in baby steps so that notchian clients (not the server) can keep up.
    var sentPosition = extend({}, entity.position);
    sentPosition.yaw = sentPosition.yaw % PI_2;
    var deltaYaw = sentPosition.yaw - lastSentYaw;
    deltaYaw = deltaYaw < 0 ?
      (deltaYaw < -PI ? deltaYaw + PI_2 : deltaYaw) :
      (deltaYaw >  PI ? deltaYaw - PI_2 : deltaYaw);
    var absDeltaYaw = Math.abs(deltaYaw);
    assert.ok(absDeltaYaw < PI + 0.001);

    var now = new Date();
    var deltaMs = now - lastPositionSentTime;
    lastPositionSentTime = now;
    var maxDeltaYaw = deltaMs / 1000 * physics.yawSpeed;
    deltaYaw = absDeltaYaw > maxDeltaYaw ? maxDeltaYaw * sign(deltaYaw) : deltaYaw;
    lastSentYaw = (lastSentYaw + deltaYaw) % PI_2;
    sentPosition.yaw = lastSentYaw;

    sendPositionAndLook(sentPosition);
  }

  function toNotchianYawPitch(position, packet) {
    packet.yaw = radiansToDegrees(PI - position.yaw);
    packet.pitch = radiansToDegrees(-position.pitch);
  }

  function fromNotchianYawPitch(position, yaw, pitch) {
    position.yaw = (PI - degreesToRadians(yaw)) % PI_2;
    position.pitch = (degreesToRadians(-pitch) + PI) % PI_2;
  }

  bot.physics = physics;
  bot.entity = entity;

  bot.setControlState = function(control, state) {
    controlState[control] = state;
    if (state && control === 'jump') jumpWasPressed = true;
  };
  bot.clearControlStates = function() {
    for (var control in controlState) {
      controlState[control] = false;
    }
  };

  // player position and look
  bot.on('packet-13', function(packet) {
    entity.position.pos.set(packet.x, packet.y, packet.z);
    entity.position.height = packet.stance - entity.position.pos.y;
    entity.position.onGround = packet.onGround;

    // apologize to the notchian server by echoing an identical position back
    sendPositionAndLook(entity.position);

    if (positionUpdateTimer == null) {
      // got first 0x0d. start the clocks
      fromNotchianYawPitch(entity.position, packet.yaw, packet.pitch);
      lastSentYaw = entity.position.yaw % PI_2;
      lastPositionSentTime = new Date();

      positionUpdateTimer = setInterval(sendPosition, POSITION_UPDATE_INTERVAL_MS);
      bot.on('end', function() {
        clearInterval(positionUpdateTimer);
      });
      bot.emit('spawn');
    }
  });
}

function extend(obj, src){
  for (var key in src) obj[key] = src[key];
  return obj;
}

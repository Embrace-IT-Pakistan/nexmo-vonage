const express = require("express");
const OpenTok = require("opentok");
const bodyParser = require("body-parser");
const config = require("./config");

const app = express();

app.use(express.static(`${__dirname}/public`));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));

const OT = new OpenTok(config.apiKey, config.apiSecret);

/**
 * generateToken is used to create a token for a user
 * @param {String} sessionId
 * @param {String} sipTokenData
 */

const generateToken = (sessionId, sipTokenData = "") =>
  //  "92cbf1ac-3cd6-4548-881b-60bc6f30b749"
  OT.generateToken(
    //  "1_MX40NzAwMDY5NH5-MTYyMTYxMTIyMTMzMX4zY2taeGd4TFQrTGduRk5zQjZ2aFkrZFJ-fg"
    sessionId,
    {
      role: "moderator",
      data: sipTokenData,
    }
  );

/**
 * generatePin is used to create a 4 digit pin
 */

const generatePin = () => {
  const pin = Math.floor(Math.random() * 9000) + 1000;
  if (app.get(pin)) {
    return generatePin();
  }
  return pin;
};

/**
   * renderRoom is used to render the ejs template
   * @param {Object} res
   * @param {String} sessionId
   * @param {String} token
   * @param {String} roomId
   * @param {Number} pinCode

*/

const renderRoom = (res, sessionId, token, roomId, pinCode) => {
  const { apiKey, conferenceNumber } = config;
  res.render("index.ejs", {
    apiKey,
    sessionId,
    token,
    roomId,
    pinCode,
    conferenceNumber,
  });
};

/**
 * setSipOptions is used to set properties for the OT.dial API call
 * @returns {Object}
 */

const setSipOptions = () => ({
  auth: {
    username: config.sip.username,
    password: config.sip.password,
  },
  secure: false,
});

/**
 * When the room/:roomId request is made, either a template is rendered is served with the
 * sessionid, token, pinCode, roomId, and apiKey.
 */

app.get("/room/:roomId", (req, res) => {
  const { roomId } = req.params;
  let pinCode;
  if (app.get(roomId)) {
    const sessionId = app.get(roomId);
    const token = generateToken(sessionId);
    console.log(token === "92cbf1ac-3cd6-4548-881b-60bc6f30b749");
    pinCode = app.get(sessionId);
    renderRoom(res, sessionId, token, roomId, pinCode);
  } else {
    pinCode = generatePin();
    OT.createSession(
      {
        mediaMode: "routed",
      },
      (error, session) => {
        if (error) {
          return res.send("There was an error").status(500);
        }
        const { sessionId } = session;
        const token = generateToken(sessionId);
        app.set(roomId, sessionId);
        app.set(pinCode, sessionId);
        renderRoom(res, sessionId, token, roomId, pinCode);
      }
    );
  }
});

/**
 * When the dial-out get request is made, the dial method of the OpenTok Dial API is invoked
 */

app.get("/dial-out", (req, res) => {
  const { roomId } = req.query;
  const { conferenceNumber } = config;
  const sipTokenData = `{"sip":true, "role":"client", "name":"'${conferenceNumber}'"}`;
  const sessionId = app.get(roomId);
  const token = generateToken(sessionId, sipTokenData);
  const options = setSipOptions();
  const sipUri = `sip:${conferenceNumber}@sip.nexmo.com;transport=tls`;
  OT.dial(sessionId, token, sipUri, options, (error, sipCall) => {
    if (error) {
      res.status(500).send("There was an error dialing out");
    } else {
      app.set(conferenceNumber + roomId, sipCall.connectionId);
      res.json(sipCall);
    }
  });
});

/**
 * When the hang-up get request is made, the forceDisconnect method of the OpenTok API is invoked
 */
app.get("/hang-up", (req, res) => {
  const { roomId } = req.query;
  const { conferenceNumber } = config;
  if (app.get(roomId) + app.get(conferenceNumber + roomId)) {
    const sessionId = app.get(roomId);
    const connectionId = app.get(conferenceNumber + roomId);
    OT.forceDisconnect(sessionId, connectionId, (error) => {
      if (error) {
        res.status(500).send("There was an error hanging up");
      } else {
        res.status(200).send("Ok");
      }
    });
  } else {
    res.status(400).send("There was an error hanging up");
  }
});

app.get("/nexmo-answer", (req, res) => {
  const { serverUrl } = config;
  const ncco = [];
  if (req.query["SipHeader_X-OpenTok-SessionId"]) {
    ncco.push({
      action: "conversation",
      name: req.query["SipHeader_X-OpenTok-SessionId"],
    });
  } else {
    ncco.push(
      {
        action: "talk",
        text: "Please enter a pin code to join the session",
      },
      {
        action: "input",
        eventUrl: [`${serverUrl}/nexmo-dtmf`],
      }
      // {
      //   action: "conversation",
      //   name: "1_MX40NzAwMDY5NH5-MTYyMTYxMTIyMTMzMX4zY2taeGd4TFQrTGduRk5zQjZ2aFkrZFJ-fg",
      // }
    );
  }

  res.json(ncco);
});

app.post("/nexmo-dtmf", (req, res) => {
  const { dtmf } = req.body;

  console.log(dtmf);
  let sessionId;
  let token;
  console.log(app.get(dtmf));

  if (app.get(dtmf)) {
    sessionId = app.get(dtmf);
    token = generateToken(sessionId);
  }

  const ncco = [
    {
      action: "conversation",
      name: sessionId,
      token: token,
    },
  ];

  console.log(ncco);
  res.json(ncco);
});

app.get("/nexmo-events", (req, res) => {
  res.status(200).send();
});

const port = process.env.PORT || "4001";
app.listen(port, () => console.log(`listening on port ${port}`));

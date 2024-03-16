require('dotenv').config()
import axios from "axios";
import express, { Express } from 'express';
import cors from "cors";
const app: Express = express();
const port = Number(process.env.PORT);
const authToken = 'fdfqLZtcEM2tb7a3GmaIBemQB1snANVftY5GplYUH5pf2dlxqy_OtxDpiaUakkMP';
var crypto = require('crypto');
var assert = require('assert');

import { Client } from 'pg'
const client = new Client({
  host: "localhost",
  database: "vendure",
  user: "vendure",
  password: "vendure",
})

client.connect()

var algorithm = 'aes256'; // or any other algorithm supported by OpenSSL
var key = 'secret';

app.use(express.json());

app.use(cors());

app.post('/', async (req, res) => {
  const emails = JSON.parse(req.body.billingAddress.customFields)['emails'].split(',');
  console.log(emails);
  for (const email of emails) {
    const cipher = crypto.createCipher(algorithm, key);
    const encrypted = cipher.update(email, 'utf8', 'hex') + cipher.final('hex');
    await axios.post('https://zammad.eyecos.org/api/v1/tickets',
      {
        title: `[ZAMMAD_INVITATION] Invitation to family plan for ${email}`,
        group: 'Users',
        customer_id: `guess:${email}`,
        state_id: "4",
        priority_id: "2",
        article: {
          from: "Users",
          to: email,
          cc: "",
          body: `<div><div><span>You're invited to join our Family Plan on Vendure!</span></div><br><div><span>To join, simply click here: http://5.75.148.51:4003/?token=${encrypted}${req.body.customer.emailAddress != email ? '&invited=true' : ''}</span></div><br><div><span>Enjoy full access immediately. Welcome aboard!</span></div><br><div><span>Cheers,</span></div></div>`,
          type_id: 1,
          sender_id: 1,
          form_id: "429965693",
          content_type: "text/html"
        },
      },
      {
        headers: {
          Authorization: `Token token=${authToken}`,
        },
      })
    await client.query(`INSERT INTO invite_users (owner, invited) VALUES ($1, $2) RETURNING *`, [req.body.customer.emailAddress, email]).catch(() => { });
  }

  res.status(200).send('Ok')
})

app.post('/login', async (req, res) => {
  try {
    console.log(req.body);
    const { username, password } = req.body;
    const auth = {
      auth: {
        username,
        password,
      },
    }

    const access_tokens = (await axios.get('https://zammad.eyecos.org/api/v1/user_access_token', auth)).data
    const pgRes = await client.query(`SELECT invited from invite_users where owner = '${req.body.username}'`)
    const pgRes2 = await client.query(`SELECT invited from invite_users where invited = '${req.body.username}'`)
    let emails = [] as any[];
    for (const row of pgRes.rows) {
      if (row.invited != req.body.username)
        emails.push(row.invited);
    }
    if (pgRes2.rows.length > 0 && !emails.includes(req.body.username)) {
      emails.unshift(req.body.username)
    }
    res.status(200).send(emails);
  } catch (err) {
    console.log(err)
    res.status(400).send("Invalid");
  }

})

app.post('/remove', async (req, res) => {
  try {
    await client.query(`DELETE from invite_users where invited = '${req.body.invited}'`);
    await axios.post('http://5.161.233.158:8085/inbound/trigger-vendure-assign-cube', {
      type: "unassigned",
      customers: [
        {
          email: req.body.invited,
        }
      ],
      group: {
        name: "pro"
      },
    }, {
      headers: {
        'content-type': 'application/json',
      }
    })
    const pgRes = await client.query(`SELECT invited from invite_users where owner = '${req.body.username}'`)
    const pgRes2 = await client.query(`SELECT invited from invite_users where invited = '${req.body.username}'`)
    let emails = [] as any[];
    for (const row of pgRes.rows) {
      if (row.invited != req.body.username)
        emails.push(row.invited);
    }
    if (pgRes2.rows.length > 0 && !emails.includes(req.body.username)) {
      emails.unshift(req.body.username)
    }
    res.status(200).send(emails);
  } catch (err) {
    console.log(err)
    res.status(400).send("Invalid");
  }

})
app.post('/login', async (req, res) => {
  try {
    console.log(req.body);
    const { username, password } = req.body;
    const auth = {
      auth: {
        username,
        password,
      },
    }

    const access_tokens = (await axios.get('https://zammad.eyecos.org/api/v1/user_access_token', auth)).data
    const pgRes = await client.query(`SELECT invited from invite_users where owner = '${req.body.username}'`)
    let emails = [] as any[];
    for (const row of pgRes.rows) {
      emails.push(row.invited);
    }
    res.status(200).send(emails);
  } catch (err) {
    console.log(err)
    res.status(400).send("Invalid");
  }

})

app.get('/', async (req, res) => {
  const decipher = crypto.createDecipher(algorithm, key);
  const email = decipher.update(req.query.token, 'hex', 'utf8') + decipher.final('utf8');
  console.log(email);

  await axios.post('http://5.161.233.158:8085/inbound/trigger-vendure-assign-cube', {
    type: "assigned",
    customers: [
      {
        email,
      }
    ],
    group: {
      name: "pro"
    },
  }, {
    headers: {
      'content-type': 'application/json',
    }
  })

  if (req.query.invited == "true") {
    await axios.post('http://5.161.233.158:8085/inbound/trigger-vendure-assign-cube', {
      type: "assigned",
      customers: [
        {
          email,
        }
      ],
      group: {
        name: "invited"
      },
    }, {
      headers: {
        'content-type': 'application/json',
      }
    })
  }

  res.status(200).send('Success')
})

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
})
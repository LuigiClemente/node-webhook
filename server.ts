require('dotenv').config()
import axios from "axios";
import express, { Express } from 'express';
import cors from "cors";
const app: Express = express();
let port = Number(process.env.PORT);
let databaseUrl = process.env.DATABASE_URL
databaseUrl = "postgres://postgres:mysecretpassword@localhost:5433/mydatabase"
var crypto = require('crypto');
var assert = require('assert');
import Keycloak from 'keycloak-connect';
import swaggerSpec from './swagger.config'; // Import your Swagger spec
import swaggerUi from 'swagger-ui-express';

const keycloak = new Keycloak({});

app.use(keycloak.middleware());

import { Client } from 'pg'
const client = new Client({
  connectionString: databaseUrl,
});

client.connect()

var algorithm = 'aes256'; // or any other algorithm supported by OpenSSL
var key = 'secret';

app.use(express.json());

app.use(cors());
app.options('*', cors());
console.log(keycloak.accountUrl());

async function seedData() {
  try {
    // Create Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS invite_users (
        id SERIAL PRIMARY KEY,
        owner VARCHAR(255) NOT NULL,
        invited VARCHAR(255) NOT NULL,
        UNIQUE(owner, invited)
      );
    `);
    console.log('Table "invite_users" created (or already exists).');

    // Insert Data
    const data = [
      ['admin3@example.com', 'bob@example.com'],
      ['charlie@example.com', 'admin3@example.com'],
      ['eva@example.com', 'frank@example.com'],
      ['grace@example.com', 'henry@example.com'],
      ['admin3@example.com', 'jack@example.com'],
      ['alice@example.com', 'bob@example.com'], // Duplicate entry for testing
    ];

    const insertQuery = `
      INSERT INTO invite_users (owner, invited)
      VALUES ${data.map(row => `('${row[0]}', '${row[1]}')`).join(',')}
      ON CONFLICT (owner, invited) DO NOTHING;
    `;

    await client.query(insertQuery);

    console.log('Data inserted (ignoring duplicates) successfully!');
  } catch (err) {
    console.error('Error seeding data:', err);
  }
}


app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

async function getInvitedUsers(username: string) {
  const pgRes = await client.query(`SELECT invited from invite_users where owner = '${username}'`)
  const pgRes2 = await client.query(`SELECT invited from invite_users where invited = '${username}'`)
  let emails = [] as any[];
  for (const row of pgRes.rows) {
    if (row.invited != username)
      emails.push(row.invited);
  }
  if (pgRes2.rows.length > 0 && !emails.includes(username)) {
    emails.unshift(username)
  }
  return emails;
}

/**
 * @swagger
 * /:
 *   post:
 *     summary: Webhook for Vendure to create user and ticket
 *     description: Triggered by Vendure to create a new user in the database and a ticket in Zammad.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               userEmail:
 *                 type: string
 *               # ... (other Vendure webhook data)
 *     responses:
 *       200:
 *         description: User created and ticket opened successfully.
 */
app.post('/', async (req, res) => {
  const emails = JSON.parse(req.body.billingAddress.customFields)['emails'].split(',');
  console.log(emails);
  for (const email of emails) {
    const cipher = crypto.createCipher(algorithm, key);
    const encrypted = cipher.update(email, 'utf8', 'hex') + cipher.final('hex');
    await axios.post(`${process.env.ZAMMAD_TICKETS_URL}`,
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
          body: `<div><div><span>You're invited to join our Family Plan on Vendure!</span></div><br><div><span>To join, simply click here: ${process.env.CUBE_ASSIGN_URL}?token=${encrypted}${req.body.customer.emailAddress != email ? '&invited=true' : ''}</span></div><br><div><span>Enjoy full access immediately. Welcome aboard!</span></div><br><div><span>Cheers,</span></div></div>`,
          type_id: 1,
          sender_id: 1,
          form_id: "429965693",
          content_type: "text/html"
        },
      },
      {
        headers: {
          Authorization: `Token token=${process.env.ZAMMAD_AUTH_TOKEN}`,
        },
      })
    await client.query(`INSERT INTO invite_users (owner, invited) VALUES ($1, $2) RETURNING *`, [req.body.customer.emailAddress, email]).catch(() => { });
  }

  res.status(200).send('Ok')
})

/**
 * @swagger
 * /assign-cube:
 *   get:
 *     summary: Assigns user to group in Cube.js
 *     description: Clicked from an invitation email to assign the user to a group.
 *     parameters:
 *       - in: query
 *         name: token
 *         schema:
 *           type: string
 *         required: true
 *         description: Unique token to identify the invitation
 *     responses:
 *       200:
 *         description: User successfully assigned to group.
 */
app.get('/assign-cube', async (req, res) => {
  const decipher = crypto.createDecipher(algorithm, key);
  const email = decipher.update(req.query.token, 'hex', 'utf8') + decipher.final('utf8');
  console.log(email);

  await axios.post(`${process.env.CAMUNDA_ASSIGN_CUBE_URL}`, {
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
    await axios.post(`${process.env.CAMUNDA_ASSIGN_CUBE_URL}`, {
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

/**
 * @swagger
 * /invited-users:
 *   get:
 *     summary: Get invited users
 *     description: Returns a list of invited users.
 *     responses:
 *       200:
 *         description: A list of invited users.
 */
app.get('/invited-users', keycloak.protect(), async (req, res) => {
  try {
    // @ts-ignore
    const email = req.kauth.grant.access_token.content.email
    console.log(email, 'invited-users');
    const emails = await getInvitedUsers(email);
    res.status(200).send(emails);
  } catch (err) {
    console.log(err)
    res.status(400).send("Invalid");
  }

})

/**
 * @swagger
 * /remove:
 *   post:
 *     summary: Remove user
 *     description: Removes a user from the system.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               userId:
 *                 type: string
 *                 description: The ID of the user to remove
 *     responses:
 *       200:
 *         description: User removed successfully.
 */
app.post('/remove', keycloak.protect(), async (req, res) => {
  try {
    
    await client.query(`DELETE from invite_users where invited = '${req.body.invited}'`);
    await axios.post(`${process.env.CAMUNDA_ASSIGN_CUBE_URL}`, {
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

    const emails = await getInvitedUsers(req.body.username);
    res.status(200).send(emails);
  } catch (err) {
    console.log(err)
    res.status(400).send("Invalid");
  }
})

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
})
seedData();
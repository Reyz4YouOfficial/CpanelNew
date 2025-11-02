import express from 'express';
import fetch from 'node-fetch';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type']
}));

app.use(express.json());
app.use(express.static('public'));

// Configuration
const apikey = 'isidewek';
const capikey = 'isidewek';
const domain = 'isidewek';
const nestid = '5';
const egg = '15';
const loc = '1';
const gmailadmin = 'admin@gmail.com'; // Admin email that won't be deleted
const telegramBotToken = '7148854426:AAGm74zljPqAPEMJELGiTGaHi5U_InIJpT4';
const adminTelegramId = '2027479396';

// In-memory storage
let servers = [];
let users = [];
let admins = [];

// Telegram helper function
async function sendTelegramMessage(chatId, message) {
  try {
    const response = await fetch(`https://api.telegram.org/bot${telegramBotToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: 'HTML'
      })
    });
    return response.ok;
  } catch (error) {
    console.error('Telegram error:', error);
    return false;
  }
}

// Authentication endpoint
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;

  if (username === 'Reyz4You' && password === 'Dev') {
    res.json({ success: true, user: { username: 'Reyz4You', role: 'Owner Server' } });
  } else {
    res.status(401).json({ error: 'Invalid credentials' });
  }
});

// Create panel
app.post('/api/create', async (req, res) => {
  const { username, email, ram, disk, cpu, telegramId } = req.body;
  const password = username + Math.floor(Math.random() * 10000);
  const name = username + '-server';

  try {
    // Create user in Pterodactyl
    const userRes = await fetch(`${domain}/api/application/users`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apikey}`,
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        email,
        username,
        first_name: username,
        last_name: 'User',
        password,
        language: 'en'
      })
    });

    const userData = await userRes.json();
    if (userData.errors) return res.json({ error: userData.errors[0].detail });

    const userId = userData.attributes.id;

    // Get egg data
    const eggData = await fetch(`${domain}/api/application/nests/${nestid}/eggs/${egg}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apikey}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      }
    });

    const eggJson = await eggData.json();
    const startup = eggJson.attributes.startup;

    // Create server
    const serverRes = await fetch(`${domain}/api/application/servers`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apikey}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name,
        user: userId,
        egg: parseInt(egg),
        docker_image: eggJson.attributes.docker_image,
        startup,
        environment: {
          INST: 'npm',
          USER_UPLOAD: '0',
          AUTO_UPDATE: '0',
          CMD_RUN: 'npm start'
        },
        limits: {
          memory: ram,
          swap: 0,
          disk: typeof disk !== 'undefined' ? disk : ram,
          io: 500,
          cpu: cpu ?? 100
        },
        feature_limits: {
          databases: 5,
          backups: 5,
          allocations: 5
        },
        deploy: {
          locations: [parseInt(loc)],
          dedicated_ip: false,
          port_range: []
        }
      })
    });

    let serverData;
    try {
      serverData = await serverRes.json();
    } catch (e) {
      const text = await serverRes.text();
      return res.status(500).json({
        error: 'Failed parsing JSON from server creation',
        detail: text || e.message
      });
    }

    if (serverData.errors) {
      return res.json({ error: serverData.errors[0].detail });
    }

    // Store locally
    const server = {
      id: serverData.attributes.id,
      name,
      username,
      pterodactylId: serverData.attributes.id,
      status: 'stopped',
      ram,
      disk: disk || ram,
      cpu: cpu || 100,
      createdAt: new Date(),
      userId
    };
    servers.push(server);

    const user = {
      id: userId,
      username,
      email,
      password,
      telegramId,
      createdAt: new Date()
    };
    users.push(user);

    // Send to Telegram
    const telegramMessage = `🆕 <b>New Panel Created!</b>

📊 <b>Panel Details:</b>
🌐 Domain: ${domain}
👤 Username: <code>${username}</code>
🔑 Password: <code>${password}</code>
📧 Email: ${email}
🖥️ Server ID: ${serverData.attributes.id}
💾 RAM: ${ram}MB
💿 Disk: ${disk || ram}MB
⚡ CPU: ${cpu || 100}%

🎉 Panel siap digunakan!`;

    if (telegramId) {
      await sendTelegramMessage(telegramId, telegramMessage);
    }

    // Notify admin
    await sendTelegramMessage(adminTelegramId, telegramMessage);

    res.json({
      username,
      password,
      email,
      panel_url: domain,
      server_id: serverData.attributes.id
    });

  } catch (err) {
    res.status(500).json({ error: 'Failed to create panel', detail: err.message });
  }
});

// Get servers
app.get('/api/servers', async (req, res) => {
  try {
    const fetchServers = await fetch(`${domain}/api/application/servers`, {
      headers: {
        'Authorization': `Bearer ${apikey}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      }
    });

    const serverData = await fetchServers.json();
    if (!serverData || !Array.isArray(serverData.data)) {
      return res.status(400).json({ error: 'Invalid server response' });
    }

    // Add age calculation
    const serversWithAge = serverData.data.map(srv => {
      const localServer = servers.find(s => s.pterodactylId == srv.attributes.id);
      const createdAt = localServer ? localServer.createdAt : new Date();
      const age = Math.floor((Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24));

      return {
        ...srv.attributes,
        age,
        username: localServer ? localServer.username : 'Unknown'
      };
    });

    res.json(serversWithAge);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch servers', detail: err.message });
  }
});

// Delete server
app.delete('/api/server/:id', async (req, res) => {
  try {
    const id = req.params.id;
    await fetch(`${domain}/api/application/servers/${id}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${apikey}`,
        'Accept': 'application/json'
      }
    });

    // Remove from local storage
    servers = servers.filter(s => s.pterodactylId != id);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete server', detail: err.message });
  }
});

// Create admin
app.post('/api/create-admin', async (req, res) => {
  const { username, email } = req.body;
  const password = username + Math.floor(Math.random() * 10000);

  try {
    const userRes = await fetch(`${domain}/api/application/users`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${capikey}`,
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        email,
        username,
        first_name: username,
        last_name: 'Admin',
        password,
        language: 'en',
        root_admin: true
      })
    });

    let userData;
    try {
      userData = await userRes.json();
    } catch (e) {
      const text = await userRes.text();
      return res.status(500).json({
        error: 'Failed parsing JSON from Pterodactyl',
        detail: text || e.message
      });
    }

    if (!userRes.ok || userData.errors) {
      return res.json({ error: userData.errors?.[0]?.detail || 'Failed to create admin' });
    }

    // Store locally
    admins.push({
      id: userData.attributes.id,
      username,
      email,
      password,
      createdAt: new Date()
    });

    // Send to Telegram
    const telegramMessage = `👑 <b>New Admin Created!</b>

📊 <b>Admin Details:</b>
🌐 Panel URL: ${domain}
👤 Username: <code>${username}</code>
🔑 Password: <code>${password}</code>
📧 Email: ${email}

🎉 Admin account ready!`;

    await sendTelegramMessage(adminTelegramId, telegramMessage);

    res.json({
      username,
      password,
      panel_url: domain
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create admin', detail: err.message });
  }
});

// Get admins
app.get('/api/admins', async (req, res) => {
  try {
    const fetchUsers = await fetch(`${domain}/api/application/users`, {
      headers: {
        'Authorization': `Bearer ${capikey}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      }
    });

    const userData = await fetchUsers.json();
    if (!userData || !Array.isArray(userData.data)) {
      return res.status(400).json({ error: 'Invalid admin response' });
    }

    const admins = userData.data
      .filter(u => u.attributes.root_admin === true && u.attributes.username)
      .map(u => ({
        id: u.attributes.id,
        username: u.attributes.username.trim()
      }));

    res.json(admins);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch admins', detail: err.message });
  }
});

// Delete admin
app.delete('/api/admin/:id', async (req, res) => {
  try {
    const id = req.params.id;
    await fetch(`${domain}/api/application/users/${id}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${capikey}`,
        'Accept': 'application/json'
      }
    });

    // Remove from local storage
    admins = admins.filter(a => a.id != id);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete admin', detail: err.message });
  }
});

// Delete all users except admin
app.post('/api/delete-all-users', async (req, res) => {
  try {
    const fetchUsers = await fetch(`${domain}/api/application/users`, {
      headers: {
        'Authorization': `Bearer ${apikey}`,
        'Accept': 'application/json'
      }
    });

    const userData = await fetchUsers.json();
    let deletedCount = 0;

    if (userData && Array.isArray(userData.data)) {
      for (const user of userData.data) {
        if (user.attributes.email !== gmailadmin && !user.attributes.root_admin) {
          try {
            await fetch(`${domain}/api/application/users/${user.attributes.id}`, {
              method: 'DELETE',
              headers: {
                'Authorization': `Bearer ${apikey}`,
                'Accept': 'application/json'
              }
            });
            deletedCount++;
          } catch (err) {
            console.error('Failed to delete user:', user.attributes.username);
          }
        }
      }
    }

    // Clear local storage except admin
    users = users.filter(u => u.email === gmailadmin);

    await sendTelegramMessage(adminTelegramId, `🗑️ Bulk Delete: ${deletedCount} users deleted`);

    res.json({ success: true, deletedCount });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete users', detail: err.message });
  }
});

// Delete all servers except admin
app.post('/api/delete-all-servers', async (req, res) => {
  try {
    const fetchServers = await fetch(`${domain}/api/application/servers`, {
      headers: {
        'Authorization': `Bearer ${apikey}`,
        'Accept': 'application/json'
      }
    });

    const serverData = await fetchServers.json();
    let deletedCount = 0;

    if (serverData && Array.isArray(serverData.data)) {
      for (const server of serverData.data) {
        // Get server owner
        try {
          const userRes = await fetch(`${domain}/api/application/users/${server.attributes.user}`, {
            headers: {
              'Authorization': `Bearer ${apikey}`,
              'Accept': 'application/json'
            }
          });

          const userData = await userRes.json();

          if (userData && userData.attributes && 
              userData.attributes.email !== gmailadmin && 
              !userData.attributes.root_admin) {

            await fetch(`${domain}/api/application/servers/${server.attributes.id}`, {
              method: 'DELETE',
              headers: {
                'Authorization': `Bearer ${apikey}`,
                'Accept': 'application/json'
              }
            });
            deletedCount++;
          }
        } catch (err) {
          console.error('Failed to delete server:', server.attributes.id);
        }
      }
    }

    // Clear local storage
    servers = [];

    await sendTelegramMessage(adminTelegramId, `🗑️ Bulk Delete: ${deletedCount} servers deleted`);

    res.json({ success: true, deletedCount });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete servers', detail: err.message });
  }
});

// Server status
app.get('/api/server-status', async (req, res) => {
  try {
    const fetchServers = await fetch(`${domain}/api/application/servers`, {
      headers: {
        'Authorization': `Bearer ${apikey}`,
        'Accept': 'application/json'
      }
    });

    const serverData = await fetchServers.json();

    if (!serverData || !Array.isArray(serverData.data)) {
      return res.json({ activeServers: 0, stoppedServers: 0, servers: [] });
    }

    const serverStatus = [];
    let activeCount = 0;
    let stoppedCount = 0;

    for (const server of serverData.data) {
      try {
        // Get server details from client API
        const statusRes = await fetch(`${domain}/api/client/servers/${server.attributes.identifier}`, {
          headers: {
            'Authorization': `Bearer ${apikey}`,
            'Accept': 'application/json'
          }
        });

        const status = await statusRes.json();
        const isRunning = status.attributes?.current_state === 'running';

        if (isRunning) activeCount++;
        else stoppedCount++;

        const localServer = servers.find(s => s.pterodactylId == server.attributes.id);
        const age = localServer ? 
          Math.floor((Date.now() - localServer.createdAt.getTime()) / (1000 * 60 * 60 * 24)) : 0;

        serverStatus.push({
          id: server.attributes.id,
          name: server.attributes.name,
          status: isRunning ? 'running' : 'stopped',
          age,
          username: localServer ? localServer.username : 'Unknown'
        });

        // Check for 30-day servers
        if (age >= 30) {
          await sendTelegramMessage(adminTelegramId, 
            `⚠️ Server "${server.attributes.name}" is ${age} days old and should be reviewed for deletion.`);
        }
      } catch (err) {
        stoppedCount++;
        serverStatus.push({
          id: server.attributes.id,
          name: server.attributes.name,
          status: 'unknown',
          age: 0,
          username: 'Unknown'
        });
      }
    }

    res.json({
      activeServers: activeCount,
      stoppedServers: stoppedCount,
      servers: serverStatus
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to get server status', detail: err.message });
  }
});

// Root endpoint
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// API info endpoint
app.get('/api', (req, res) => {
  res.json({
    message: 'Pterodactyl Panel Management API',
    endpoints: {
      'POST /api/login': 'Login endpoint',
      'POST /api/create': 'Create panel',
      'GET /api/servers': 'List all servers',
      'DELETE /api/server/:id': 'Delete server',
      'POST /api/create-admin': 'Create admin user',
      'GET /api/admins': 'List admins',
      'DELETE /api/admin/:id': 'Delete admin',
      'POST /api/delete-all-users': 'Delete all non-admin users',
      'POST /api/delete-all-servers': 'Delete all non-admin servers',
      'GET /api/server-status': 'Get server status overview'
    },
    status: 'online'
  });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Panel API ready at :${PORT}`);
});

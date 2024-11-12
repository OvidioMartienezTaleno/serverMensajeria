const express = require('express');
const WebSocket = require('ws');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const { type } = require('os');

const app = express();
const port = 8080;

const server = app.listen(port, () => {
  console.log(`Servidor corriendo en http://localhost:${port}`);
});

app.use(express.static(path.join(__dirname, 'public')));

const wss = new WebSocket.Server({ server });

const db = new sqlite3.Database('./dataBase/psi.db', (err) => {
  if (err) {
    console.error('Error al conectar con la base de datos:', err.message);
  } else {
    console.log('Conectado a la base de datos SQLite.');
  }
});

// Crear tabla de usuarios
db.run(`
  CREATE TABLE IF NOT EXISTS user (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_name TEXT UNIQUE,
    password TEXT,
    full_name TEXT
  )
`);

// Agregar esto justo después de la conexión a la base de datos
db.serialize(() => {
  // Primero crear la tabla si no existe
  db.run(`
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sender_id INTEGER,
      receiver_id INTEGER,
      content TEXT,
      file_name TEXT DEFAULT NULL,
      file_type TEXT DEFAULT NULL,
      file_size INTEGER DEFAULT NULL,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (sender_id) REFERENCES user(id),
      FOREIGN KEY (receiver_id) REFERENCES user(id)
    )`, 
    (err) => {
      if (err) {
        console.error('Error creating/checking messages table:', err);
      } else {
        console.log('Messages table ready');
      }
  });

  // Verificar si necesitamos agregar las columnas para archivos
  db.get("PRAGMA table_info(messages)", (err, rows) => {
    if (err) {
      console.error('Error checking table structure:', err);
      return;
    }

    // Solo intentar agregar las columnas si no existen
    const alterTableQueries = [
      "ALTER TABLE messages ADD COLUMN file_name TEXT DEFAULT NULL;",
      "ALTER TABLE messages ADD COLUMN file_type TEXT DEFAULT NULL;",
      "ALTER TABLE messages ADD COLUMN file_size INTEGER DEFAULT NULL;"
    ];

    alterTableQueries.forEach(query => {
      db.run(query, (err) => {
        // Ignorar errores de "columna ya existe"
        if (err && !err.message.includes('duplicate column')) {
          console.error('Error adding column:', err);
        }
      });
    });
  });
});

// Mapa para almacenar la información de los clientes conectados al servidor WebSocket
const clients = new Map();

// Evento que se activa cuando un cliente se conecta al servidor WebSocket
wss.on('connection', (ws) => {
  console.log('Cliente conectado');

  ws.on('message', (message) => {
    console.log(`Mensaje recibido: ${message}`);
    try {
      const parsedMessage = JSON.parse(message);

      // Maneja el tipo de mensaje recibido usando un switch
      switch(parsedMessage.type) {
        case 'register':
          handleRegister(ws, parsedMessage.data); 
          break;
        case 'login':
          handleLogin(ws, parsedMessage.data); 
          break;
        case 'get_users':
          handleGetUsers(ws);
          break;
        case 'send_message':
          handleSendMessage(ws, parsedMessage.data);
          break;
        case 'get_messages':
          handleGetMessages(ws, parsedMessage.data); 
          break;
        case 'user_connected':
          handleUserConnected(ws, parsedMessage.data); 
          break;
        case 'get_friends':
          handleGetFriends(ws, parsedMessage.data); 
          break;
        case 'add_friend':
          addFriendByUsername(ws, parsedMessage.data); 
          break;
        case 'delete_friend':
          deleteFriendByUsername(ws, parsedMessage.data); 
          break;
        case 'delete_message':
          handleDeleteMessage(ws, parsedMessage.data); 
          break;
        case 'edit_message':
          handleEditMessage(ws, parsedMessage.data); 
          break;
        case 'count_messages_request':
          countMessages(ws);
          break;
        case 'log_out':
          removeUsers(parsedMessage.data,ws)
          break;
        case 'temporaryM':
          registerTemporaryM(ws, parsedMessage.data)
          break;
        case 'deactivateT':
          deactivateTemporaryM(ws, parsedMessage.data)
          stopTemporaryM()
          break;
        case 'send_file':
          handleSendFile(ws, parsedMessage);
          break;
      }
    } catch (error) {
      console.error('Error processing message:', error); // Imprime un mensaje de error si la conversión de JSON falla o ocurre otro problema
    }
  });

  // Evento que se activa cuando un cliente cierra la conexión con el servidor
  ws.on('close', () => {
    const user = clients.get(ws); // Obtiene los datos del usuario asociado al WebSocket
    if (user) {
      clients.delete(ws); // Elimina al usuario del mapa de clientes conectados
      broadcastUsersList(); // Llama a la función para enviar la lista actualizada de usuarios a todos los clientes conectados
    }
  });
});


//funcion obtener la fecha actual en un orden especifico
function newDateR(valor){
  const now = new Date();

  // Obtener partes de la fecha
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  if(valor === 1){
    const formattedDate = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
    return formattedDate
  }
  if(valor === 2){
    const formattedDate = `${year}-${month}-${day}`;
    return formattedDate
  }
  
}


//funcion para agregar amigos
function addFriendByUsername(ws, data) {
  const friendUserName = data.userName;
  const userId = data.userID;

  // Buscar el ID del amigo por su nombre de usuario
  db.get('SELECT id FROM user WHERE user_name = ?', [friendUserName], (err, row) => {
    if (err) {
      console.error('Error al buscar el usuario:', err.message);
      ws.send(JSON.stringify({
        type: 'success',
        success: false,
        message: 'Error al buscar el usuario.'
      }));
      return;
    }
    
    if (!row) {
      ws.send(JSON.stringify({
        type: 'success',
        success: false,
        message: 'El usuario especificado no existe.'
      }));
      return;
    }

    const friendId = row.id;

    // Insertar la relación de amistad en ambas direcciones
    const stmt = db.prepare(`
      INSERT INTO friends (user_id, friend_id) VALUES (?, ?), (?,?)
    `);

    stmt.run(userId, friendId, friendId, userId,(err) => {
      if (err) {
        ws.send(JSON.stringify({
          type: 'success',
          success: false,
          message: 'No se pudo agregar el amigo. Puede que ya esté en la lista.'
        }));
      } else {
        ws.send(JSON.stringify({
          type: 'success',
          success: true,
          message: 'Amigo agregado correctamente.'
        }));
      }
    });

    stmt.finalize();
  });
}

//funcion para eliminar la relacion de amigos
function deleteFriendByUsername(ws, data) {
  const friendUserName = data.userName;
  const userId = data.userID;

  // Buscar el ID del amigo por su nombre de usuario
  db.get('SELECT id FROM user WHERE user_name = ?', [friendUserName], (err, row) => {
      if (err) {
        console.error('Error al buscar el usuario:', err.message);
        ws.send(JSON.stringify({
          type: 'delete',
          success: false,
          message: 'Error al buscar el usuario.'
        }));
        return;
      }
      if (!row) {
        ws.send(JSON.stringify({
          type: 'delete',
          success: false,
          message: 'El usuario especificado no existe.'
        }));
        return;
      }
      const friendId = row.id;

      // Eliminar la relación de amistad en ambas direcciones
      const stmt = db.prepare(`
          DELETE FROM friends 
          WHERE (user_id = ? AND friend_id = ?) 
             OR (user_id = ? AND friend_id = ?)
      `);
      stmt.run(userId, friendId, friendId, userId, (err) => {
        if (err) {
          ws.send(JSON.stringify({
            type: 'delete',
            success: false,
            message: 'No se pudo eliminar la relación de amistad.'
          }));
        } else {
          ws.send(JSON.stringify({
            type: 'delete',
            success: true,
            message: 'Amigo eliminado correctamente.'
          }));
        }
      });
      stmt.finalize();
  });
}

//funcion para iniciar un usuario en la aplicaion(registro)
function handleRegister(ws, data) {
  const { username, password, fullname } = data;
  const stmt = db.prepare(`INSERT INTO user (user_name, password, full_name) VALUES (?, ?, ?)`);
  
  stmt.run(username, password, fullname, function(err) {
    if (err) {
      ws.send(JSON.stringify({
        type: 'register',
        success: false,
        message: 'Error al registrar el usuario.'
      }));
    } else {
      ws.send(JSON.stringify({
        type: 'register',
        success: true,
        message: 'Registro exitoso.'
      }));
    }
  });
  stmt.finalize();
}

//funcion para inciar la aplicacion (login)
function handleLogin(ws, data) {
  const { username, password } = data;
  
  //Busca el la DB si hay algun usuario con esos datos
  db.get('SELECT * FROM user WHERE user_name = ? AND password = ?', [username, password], (err, row) => {
    if (err) {
      //retorna al cliente falso o error del servidor 
      ws.send(JSON.stringify({
        type: 'login',
        success: false,
        message: 'Error en el servidor'
      }));
    } else if (row) {
      //aigna los datos al client(usuario)
      clients.set(ws, { 
        id: row.id, 
        username: row.user_name,
        fullname: row.full_name 
      });
      
      //retorna al cliente los datros del usuario
      ws.send(JSON.stringify({
        type: 'login',
        success: true,
        user: {
          id: row.id,
          username: row.user_name,
          fullname: row.full_name
        }
      }));
      
      broadcastUsersList();
    } else {
      ws.send(JSON.stringify({
        type: 'login',
        success: false,
        message: 'Usuario o contraseña incorrectos'
      }));
    }
  });
}

//Funcion para obrener los usuarios en general.
function handleGetUsers(ws) {
  db.all('SELECT id, user_name, full_name FROM user', [], (err, rows) => {
    if (err) {
      ws.send(JSON.stringify({
        type: 'users_list',
        success: false,
        message: 'Error al obtener usuarios'
      }));
    } else {
      ws.send(JSON.stringify({
        type: 'users_list',
        success: true,
        users: rows
      }));
    }
  });
}

//variable para almacenar el resultado de la funcion enviarTraduccion.
let resultadoTraducido;

//funcion para conectar con el script de python(API) y trael el json con la traduccion.
async function enviarTraduccion(texto) {
    //URL con la dirección y el puerto donde se está ejecutando el servidor Flask
    const url = 'http://127.0.0.1:5000/traduccion';

    try {
        const response = await fetch(url, {
            method: 'POST',  // Método HTTP POST para enviar datos
            headers: {
                'Content-Type': 'application/json'  // Tipo de contenido JSON
            },
            body: JSON.stringify({ text: texto })  // El cuerpo de la solicitud con el texto que quieres traducir
        });
        if (!response.ok) {
            throw new Error(`Error en la solicitud al servidor Flask: ${response.status} ${response.statusText}`);
        }
        const data = await response.json();
        resultadoTraducido = data.translatedText || data.error;  // Asigna el resultado a la variable global
    } catch (error) {
        console.error('Error al conectarse con el servidor Flask:', error);
    }

    // Devuelve el resultado para su uso
    return resultadoTraducido;
}

//funcion para devolver mensaje cuando retorna el traduccir.
function returnHandleSendMessage(ws, receiver_id,content) {
  const sender = clients.get(ws);

  if (!sender) return;

  // Crear un nuevo mensaje que simule ser enviado por el receptor
  const messageData = {
    sender_id: receiver_id,  // Cambiar el sender_id para que sea el receptor
    receiver_id: sender.id,  // Mantener el receiver_id como el ID del remitente
    content: content,
    timestamp: new Date().toLocaleString()
  };
  //let newDate = new Date().toLocaleString()
  // Guardar el mensaje en la base de datos
  const stmt = db.prepare(`
    INSERT INTO messages (sender_id, receiver_id, content, timestamp)
    VALUES (?, ?, ?, ?)
  `);
  const newDate = newDateR(1)
  stmt.run(receiver_id, sender.id, content, newDate, function(err) {
    if (err) {
      ws.send(JSON.stringify({
        type: 'message_sent',
        success: false,
        message: 'Error al enviar el mensaje'
      }));
    } else {

      // Enviar al remitente
      ws.send(JSON.stringify({
        type: 'message_sent',
        success: true,
        message: messageData
      }));

      // Enviar al destinatario si está conectado
      wss.clients.forEach(client => {
        const userData = clients.get(client);
        if (userData && userData.id === sender.id) {
          client.send(JSON.stringify({
            type: 'new_message',
            message: messageData,
            sender: {
              id: receiver_id,  // Cambiar el ID del remitente en el mensaje
              fullname: userData.fullname  // Asumir que fullname del receptor está disponible
            }
          }));
        }
      });
    }
  });
  stmt.finalize();
}

// Función para enviar mensajes entre usuarios, identificando el emisor y el receptor
function handleSendMessage(ws, data) {
  const { receiver_id, content } = data;
  const sender = clients.get(ws);
  if (!sender) return;

  // Prepara una declaración SQL para insertar el mensaje en la base de datos
  const stmt = db.prepare(`
    INSERT INTO messages (sender_id, receiver_id, content, timestamp)
    VALUES (?, ?, ?, ?)
  `);

  const newDate = newDateR(1);

  // Ejecuta la declaración para insertar el mensaje
  stmt.run(sender.id, receiver_id, content, newDate, function(err) {
    if (err) {
      // Si ocurre un error al enviar el mensaje, notifica al remitente
      ws.send(JSON.stringify({
        type: 'message_sent',
        success: false,
        message: 'Error al enviar el mensaje'
      }));
    } else {
      // Si el receptor es un usuario específico (ID 1), traduce el contenido del mensaje
      if (receiver_id === 1) {
        const valor = decryptMessage(content);  //        const valor = decryptMessage(content);
        enviarTraduccion(valor).then(result => {
          const auxValor = result
          const traduccion = encryptMessage(auxValor, 3);
          returnHandleSendMessage(ws, receiver_id, traduccion);
        });
      }    
      
      // Crea un objeto con los datos del mensaje para enviarlo
      const messageData = {
        id: this.lastID, 
        sender_id: sender.id, 
        receiver_id: receiver_id, 
        content: content,
        timestamp: new Date().toLocaleString('es-CR') 
      };

      // Envía una respuesta al remitente indicando que el mensaje fue enviado con éxito
      ws.send(JSON.stringify({
        type: 'message_sent',
        success: true,
        message: messageData
      }));

      // Recorre todos los clientes conectados para enviar el mensaje al destinatario si está conectado
      wss.clients.forEach(client => {
        const userData = clients.get(client); // Obtiene los datos del usuario conectado
        if (userData && userData.id === receiver_id) { 
          
          client.send(JSON.stringify({
            type: 'new_message', 
            message: messageData, 
            sender: {
              id: sender.id, // ID del remitente
              fullname: sender.fullname 
            }
          }));
        }
      });
    }
  });
  stmt.finalize(); // Finaliza la declaración preparada
}


//Funcion para obtener todos los mensajes de un usuario en especifico, con el id
function handleGetMessages(ws, data) {
  const { other_user_id } = data;
  const currentUser = clients.get(ws);
  
  if (!currentUser) return;

  //busca en la base de datos
  db.all(`
    SELECT * FROM messages 
    WHERE (sender_id = ? AND receiver_id = ?)
    OR (sender_id = ? AND receiver_id = ?)
    ORDER BY timestamp ASC
  `, [currentUser.id, other_user_id, other_user_id, currentUser.id], (err, rows) => {
    if (err) {
      //retorna al cliente con mensaje de error
      ws.send(JSON.stringify({
        type: 'messages_history',
        success: false,
        message: 'Error al obtener mensajes'
      }));
    } else {
      //retorna al cliente con el mensaje del user_id
      ws.send(JSON.stringify({
        type: 'messages_history',
        success: true,
        messages: rows
      }));
    }
  });
}

//funcion para retornar los datos del user_id conectado
function handleUserConnected(ws, data) {
  try{
    const { userId } = data;
    if(userId !== 0){
      db.run(`INSERT OR IGNORE INTO online_users (id) VALUES (?)`,
        [userId], (err) => {
        if (err) {
          ws.send(JSON.stringify({
            type: 'add_user_online',
            success: false,
            message: 'Error al agregar el usuario a la tabla'
          }));
        }
      });
    }

    //se conecta a la base de datos y busca al usuario
    db.get('SELECT * FROM user WHERE id = ?', [userId], (err, row) => {
      if (!err && row) {
        clients.set(ws, { 
          id: row.id, 
          username: row.user_name,
          fullname: row.full_name 
        });
        broadcastUsersList();
      }
    });
  }catch{
    console.log("Administrador")
  }
}

//funcion para obtener los amogos del usuario conectado
function handleGetFriends(ws, userIds) {
  const { userId } = userIds;
  //busca en la DB por medio de los id's
  db.all(`
    SELECT u.id, u.user_name, u.full_name
    FROM friends f
    JOIN user u ON f.friend_id = u.id
    WHERE f.user_id = ?
  `, [userId], (err, rows) => {
    if (err) {
      //Manda al cliente mensaje de error
      ws.send(JSON.stringify({
        type: 'friends_list',
        success: false,
        message: 'Error al obtener la lista de amigos'
      }));
    } else {
      //manda al cliente un json con todos los amigos que tenga registrados
      ws.send(JSON.stringify({
        type: 'friends_list',
        success: true,
        friends: rows
      }));
    }
  });
}

// Función que envía la lista de usuarios conectados a todos los clientes conectados al WebSocket
function broadcastUsersList() {
  // Consulta a la base de datos para obtener todos los usuarios con sus id, nombres de usuario y nombres completos
  db.all('SELECT id, user_name, full_name FROM user', [], (err, rows) => { 
    if (!err) {
      // Crea un mensaje en formato JSON que contiene el tipo de mensaje, el estado de éxito y la lista de usuarios obtenida
      const message = JSON.stringify({
        type: 'users_list', 
        success: true,      // Indica que la consulta fue exitosa
        users: rows        
      });
      // Recorre todos los clientes conectados al servidor WebSocket
      wss.clients.forEach(client => {
        // Verifica si el estado del cliente está abierto (es decir, listo para recibir mensajes)
        if (client.readyState === WebSocket.OPEN) {
          // Envía el mensaje con la lista de usuarios al cliente
          client.send(message);
        }
      });
    }
  });
}

// Función para eliminar mensajes de la base de datos indicando el ID del mensaje y el ID del usuario
function handleDeleteMessage(ws, data) {
  const currentUser = clients.get(ws);
  const messageId = data.message_id;

  if (!currentUser) return; // Verifica si el usuario actual está conectado

  // Consulta el mensaje en la base de datos
  db.get('SELECT * FROM messages WHERE id = ? AND sender_id = ?', [messageId, currentUser.id], (err, message) => {
    if (err || !message) {
      // Enviar respuesta de error si hay un problema con la base de datos o el mensaje no existe/no es autorizado
      ws.send(JSON.stringify({
        type: 'message_deleted',
        success: false,
        message: err ? 'Database error' : 'Message not found or not authorized'
      }));
      return;
    }

    // Elimina el mensaje de la base de datos
    db.run('DELETE FROM messages WHERE id = ?', [messageId], (err) => {
      if (err) {
        ws.send(JSON.stringify({
          type: 'message_deleted',
          success: false,
          message: 'Error deleting message'
        }));
        return;
      }

      // Confirmación de eliminación exitosa al cliente
      ws.send(JSON.stringify({
        type: 'message_deleted',
        success: true
      }));

      // Notifica al destinatario si está conectado
      notifyReceiverOfDeletion(message.receiver_id, messageId);
    });
  });
}

// Función auxiliar para notificar al receptor si está conectado
function notifyReceiverOfDeletion(receiverId, messageId) {
  wss.clients.forEach(client => {
    const userData = clients.get(client);
    if (userData && userData.id === receiverId) {
      client.send(JSON.stringify({
        type: 'message_deleted',
        success: true,
        message_id: messageId
      }));
    }
  });
}

//funcion para editar los mensajes de los perfiles
function handleEditMessage(ws, data) {
  const currentUser = clients.get(ws);
  const { message_id, content } = data;

  if (!currentUser) {
    return sendResponse(ws, false, 'User not connected');
  }
  // Verificar si el mensaje existe y si el usuario tiene permiso para editarlo
  getMessageById(message_id, currentUser.id, (err, message) => {
      if (err || !message) {
        return sendResponse(ws, false, 'Message not found or not authorized');
      }
      // Actualizar el mensaje en la base de datos
      updateMessageContent(message_id, content, (err) => {
        if (err) {
          return sendResponse(ws, false, 'Error updating message');
        }
        // Responder al usuario que editó el mensaje
        sendResponse(ws, true, null, message_id, content);
        
        // Notificar al receptor del mensaje si está conectado
        notifyReceiver(message.receiver_id, message_id, content);
      });
  });
}


//fincuion para comunicar con el cliente
function sendResponse(ws, success, message = null, message_id = null, content = null) {
  ws.send(JSON.stringify({
      type: 'message_edited',
      success: success,
      message_id: message_id,
      content: content,
      message: message
  }));
}

//funcion para obtener el mensaje segun su id
function getMessageById(message_id, sender_id, callback) {
  db.get(
      'SELECT * FROM messages WHERE id = ? AND sender_id = ?',
      [message_id, sender_id],
      callback
  );
}

//funcion para actualizar el contenido del mensaje
function updateMessageContent(message_id, content, callback) {
  db.run(
      'UPDATE messages SET content = ? WHERE id = ?',
      [content, message_id],
      callback
  );
}

// Función que notifica al destinatario (receiver) que un mensaje ha sido editado
function notifyReceiver(receiver_id, message_id, content) {
  wss.clients.forEach(client => {    
    // Obtiene los datos del cliente actual de la colección 'clients'
    const userData = clients.get(client);
    // Verifica si los datos del usuario existen y si su ID coincide con el ID del destinatario
    if (userData && userData.id === receiver_id) {
      // Envía un mensaje al cliente en formato JSON indicando que un mensaje ha sido editado
      client.send(JSON.stringify({
        type: 'message_edited', 
        success: true,         
        message_id: message_id, // ID del mensaje que ha sido editado
        content: content        
      }));
    }
  });
}

// Función para contar la cantidad total de mensajes y los mensajes desde una fecha específica.
function countMessages(ws) {
  try {
    const newDate = newDateR(2);

    // Consulta combinada para contar los mensajes totales y los mensajes desde una fecha específica.
    db.get(
      `SELECT 
          (SELECT COUNT(*) FROM messages) AS total,
          (SELECT COUNT(*) FROM online_users) AS totalUser,
          (SELECT COUNT(*) FROM messages WHERE timestamp >= ?) AS totalFromDate`,
      [newDate],
      (err, row) => {
        if (err) {
          throw new Error('Error al obtener los conteos de mensajes: ' + err.message);
        }

        // Envía los resultados al cliente.
        ws.send(JSON.stringify({
          type: 'count_messages',
          success: true,
          total: row.total, // Total de mensajes en la base de datos.
          totalUsers: row.totalUser,
          messagesFromDate: row.totalFromDate // Total de mensajes desde la fecha.
        }));
      }
    );
  } catch (error) {
    console.error(error.message);
    ws.send(JSON.stringify({
      type: 'count_messagess',
      success: false,
      message: 'Error al obtener los conteos de mensajes'
    }));
  }
}


//funcion para eliminar el registro de id de la db
function removeUsers(userId, ws) {
  const query = `DELETE FROM online_users WHERE id = ?`;
  try{
    db.run(query, [userId.idUser], (err) => {
      if (err) {
        ws.send(JSON.stringify({
          type: 'remove_user_online',
          success: false,
          message: 'Error al eliminar el usuario de la tabla'
        }));
      }
    });
  }catch{
    console.log("No hay registros")
  }
}
// Variable global para almacenar el identificador del intervalo
let intervaloId;

// Función para registrar los mensajes temporales y ejecutar la acción después del tiempo
function registerTemporaryM(ws, data) {
  const { sender, receiver } = data;

  // Registra en la base de datos
  db.run(`INSERT INTO temporary (id_sender, id_receiver) VALUES (?, ?)`, 
  [sender, receiver], (err) => {
    if (err) {
      ws.send(JSON.stringify({
        type: 'temporaryA',
        success: false,
        message: 'Error al agregar el registro a la tabla'
      }));
    } else {
      ws.send(JSON.stringify({
        type: 'temporaryA',
        success: true,
        message: 'Registro exitoso'
      }));
    }
  });

  // Elimina los mensajes en ciclo hasta que se interrumpa
  intervaloId = setInterval(function() {
    const { sender, receiver } = data;

    const query = `DELETE FROM messages 
      WHERE (sender_id = ? AND receiver_id = ?)
      OR (sender_id = ? AND receiver_id = ?)`;

    db.run(query, [sender, receiver, receiver, sender], (err) => {
      if (err) {
        console.error('Error al eliminar los mensajes:', err);
        return;
      } else {
        ws.send(JSON.stringify({
            type: 'confirmation',
            success: true,
            message: 'Eliminados correctamente los registros de la tabla'
        }));
      }
    });
  }, 10000);
}

// Función para detener el ciclo de eliminación
function stopTemporaryM() {
    if (intervaloId) {
        clearInterval(intervaloId);
        console.log("Ciclo de eliminación detenido.");
    } else {
        console.log("No hay ciclo en ejecución.");
    }
}


function deactivateTemporaryM(ws, data){
  const{sender ,receiver}= data;
  db.run(`DELETE FROM temporary WHERE id_sender = ? AND id_receiver = ?`, 
    [sender, receiver], (err) => {
    if (err) {
      ws.send(JSON.stringify({
        type: 'exito',
        success: false,
        message: 'Error al agregar el registros a la tabla'
      }));
    }else{
      ws.send(JSON.stringify({
        type: 'exito',
        success: true,
        message: 'registro exitoso'
      }));
    }
  });
}

// Función para desencriptar un mensaje cifrado con el cifrado César
function decryptMessage(encryptedMessage) {
  // Invertir el desplazamiento para desencriptar
  const decryptShift = (26 - (3 % 26)) % 26; //desplazamiento sea positivo y dentro del rango
  return encryptMessage(encryptedMessage, decryptShift);
}

// Función de cifrado (reutilizada para desencriptar con un desplazamiento inverso)
function encryptMessage(message, shift) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
  const shiftAmount = shift % 26; //desplazamiento esté dentro del rango del alfabeto

  return message.split('').map(char => {
      const index = alphabet.indexOf(char);

      // Si el carácter no está en el alfabeto (espacios, puntuación, etc.), se deja igual
      if (index === -1) {
          return char;
      }
      // Cálculo del nuevo índice y ajuste en caso de que se pase del final del alfabeto
      const isUpperCase = char === char.toUpperCase();
      const baseIndex = isUpperCase ? 0 : 26; // Asegura que se mantenga la capitalización
      const newIndex = (index - baseIndex + shiftAmount) % 26 + baseIndex;

      return alphabet[newIndex];
  }).join('');
}

// Nueva función para manejar el envío de archivos
function handleSendFile(ws, parsedMessage) {
  const { receiver_id, file_name, file_type, file_size, content } = parsedMessage.data;
  const sender = clients.get(ws);
  
  if (!sender) return;

  // Crear timestamp
  const timestamp = new Date().toISOString();

  const stmt = db.prepare(`
    INSERT INTO messages (sender_id, receiver_id, content, file_name, file_type, file_size, timestamp)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    sender.id, 
    receiver_id, 
    content,
    file_name,
    file_type,
    file_size,
    timestamp,
    function(err) {
      if (err) {
        ws.send(JSON.stringify({
          type: 'message_sent',
          success: false,
          message: 'Error al enviar el archivo'
        }));
      } else {
        const messageData = {
          id: this.lastID,
          sender_id: sender.id,
          receiver_id: receiver_id,
          content: content,
          file_name: file_name,
          file_type: file_type,
          file_size: file_size,
          timestamp: timestamp // Usar el mismo timestamp que guardamos en la BD
        };

        // Enviar confirmación al remitente
        ws.send(JSON.stringify({
          type: 'message_sent',
          success: true,
          message: messageData
        }));

        // Notificar al destinatario
        wss.clients.forEach(client => {
          const userData = clients.get(client);
          if (userData && userData.id === receiver_id) {
            client.send(JSON.stringify({
              type: 'new_message',
              message: messageData,
              sender: {
                id: sender.id,
                fullname: sender.fullname
              }
            }));
          }
        });
      }
    }
  );
  stmt.finalize();
}
Sistema de Chat Distribuido v1.1 

Descripción:
Este proyecto busca desarrollar un sistema de chat distribuido avanzado, que permita a los 
usuarios comunicarse en tiempo real mediante mensajes de texto y el intercambio de archivos 
multimedia, incluyendo texto, fotos, vídeos y audios. Este sistema integrará funcionalidades 
avanzadas para enriquecer la interacción de los usuarios y mejorar la gestión del contenido. 
Las características clave incluirán sincronización efectiva de mensajes, encriptación robusta 
para la seguridad de las comunicaciones, gestión avanzada de usuarios con autenticación y 
manejo de sesiones, y la programación de tareas como recordatorios y alertas, todo bajo un 
marco de sistemas distribuidos y gestión de procesos. 

Instrucciones de Instalación
Requisitos:
Node.js (versión 14 o superior)
npm o yarn para gestionar las dependencias
Una cuenta de AWS con un bucket S3 configurado
SQLite, Express y WS 

Clonar el Repositorio:
git clone https://github.com/OvidioMartienezTaleno/serverMensajeria.git
cd websocket
node app.js

Instalar Dependencias: Asegúrate de tener Node.js instalado. Luego ejecuta:
npm install

Ejecución del Servidor: Para iniciar el servidor
El servidor estará disponible en http://localhost:8080.

Guía de Uso

Conexión vía WebSocket: El servidor también soporta conexiones WebSocket para actualizaciones en tiempo real de los mensajes. Una vez conectado, el servidor enviará la lista de usuarios y mensajes al cliente de WebSocket.

Documentación de API
Descripción: Retorna un JSON con la siguiente estructura: 
Input:{
text:"hola"
}
Método: GET
Respuesta:

[
Output:{
	sourceLanguage:"Spanish"
	translatedText:"Hello"
	translated:true
	}
]

Contribuciones y Créditos
Autores:
Gerson Vargas Gamboa
Josseph Valverde Robles
Ovidio Martínez Taleno

Este proyecto ha utilizado las siguientes tecnologías y recursos:
[WebSocket] - Comunicación en tiempo real
[Node.js] - Entorno de ejecución para JavaScript en el server
[HTML-CSS] - A nivel de diseño gráfico
[JavaScript] - Nivel backend 
[Python-FLASK] - API del bot 

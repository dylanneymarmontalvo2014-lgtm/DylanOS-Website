const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 5500;

// Extensiones estáticas que deben servirse directamente
const staticExtensions = ['.js', '.css', '.png', '.webp', '.jpg', '.ico', '.svg', '.woff', '.woff2'];

const server = http.createServer((req, res) => {
  let filePath = path.join(__dirname, req.url === '/' ? 'index.html' : req.url);

  fs.readFile(filePath, (err, content) => {
    if (err) {
      // Si es un archivo estático, devolver 404 en lugar de servir index.html
      const isStatic = staticExtensions.some(ext => filePath.endsWith(ext));
      if (isStatic) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('404 Not Found');
        return;
      }
      
      // Si es una ruta de aplicación, servir index.html (para SPA routing)
      fs.readFile(path.join(__dirname, 'index.html'), (err, content) => {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(content);
      });
    } else {
      let contentType = 'text/html';
      if (filePath.endsWith('.js')) contentType = 'application/javascript';
      if (filePath.endsWith('.css')) contentType = 'text/css';
      if (filePath.endsWith('.png')) contentType = 'image/png';
      if (filePath.endsWith('.webp')) contentType = 'image/webp';
      if (filePath.endsWith('.jpg')) contentType = 'image/jpeg';
      if (filePath.endsWith('.ico')) contentType = 'image/x-icon';
      if (filePath.endsWith('.svg')) contentType = 'image/svg+xml';
      if (filePath.endsWith('.woff')) contentType = 'font/woff';
      if (filePath.endsWith('.woff2')) contentType = 'font/woff2';
      
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
    }
  });
});

server.listen(PORT, () => {
  console.log(`Servidor ejecutándose en http://127.0.0.1:${PORT}`);
});

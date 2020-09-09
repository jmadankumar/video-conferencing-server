import express from 'express';
import http from 'http';
import bodyParser from 'body-parser';
import cors from 'cors';
import { initMeetingServer } from './lib/meeting-server';
import router from './routes';

const PORT = 8081;
const app = express();
const server = http.createServer(app);

initMeetingServer(server);

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(cors());

app.get('/echo', (req, res) => {
  res.send('Echo From server');
});

app.use(router);

server.listen(PORT, () => {
  console.log(`Server started at port : ${PORT}`);
});

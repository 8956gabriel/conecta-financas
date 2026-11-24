// Voz do Papai Noel: gera um MP3 com voz masculina em português (pt-BR-AntonioNeural).
// Assim o áudio toca igual em qualquer celular (inclusive no navegador do WhatsApp e no iPhone)
// e pode ir junto no vídeo. Nada é salvo: o texto só é usado para gerar o áudio.
import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';

const VOZ = 'pt-BR-AntonioNeural';

export default async function handler(req, res) {
  const bruto = String((req.method === 'POST' ? req.body?.texto : req.query?.texto) || '');
  const texto = bruto.replace(/[<>&]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 700);
  if (!texto) return res.status(400).json({ erro: 'Texto vazio' });

  const tts = new MsEdgeTTS();
  try {
    await tts.setMetadata(VOZ, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3);
    const { audioStream } = tts.toStream(texto, { pitch: '-14%', rate: '-8%' });
    const partes = [];
    await new Promise((ok, falha) => {
      audioStream.on('data', (c) => partes.push(c));
      audioStream.on('end', ok);
      audioStream.on('close', ok);
      audioStream.on('error', falha);
    });
    const mp3 = Buffer.concat(partes);
    if (mp3.length < 1000) throw new Error('Áudio vazio');
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Length', mp3.length);
    res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=31536000, immutable');
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(200).send(mp3);
  } catch (e) {
    return res.status(502).json({ erro: 'Não foi possível gerar a voz agora', detalhe: String(e?.message || e).slice(0, 200) });
  } finally {
    try { tts.close(); } catch (_) {}
  }
}

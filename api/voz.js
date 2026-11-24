// Voz do Papai Noel (ElevenLabs): gera um MP3 com a mensagem falando o nome.
// Toca igual em qualquer celular (inclusive iPhone e navegador do WhatsApp).
// Nada é salvo: o texto só é usado para gerar o áudio. O mesmo texto fica em
// cache na Vercel, então repetir o mesmo nome não gasta crédito de novo.
//
// Variáveis de ambiente na Vercel (Settings › Environment Variables):
//   ELEVENLABS_API_KEY   → chave da conta ElevenLabs (obrigatória)
//   ELEVENLABS_VOICE_ID  → (opcional) ID da voz escolhida na Voice Library;
//                          sem ela usa "Bill", voz masculina grave e madura.

const VOZ_PADRAO = 'pqHfZKP75CyOlbR8g6SU';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const chave = process.env.ELEVENLABS_API_KEY;
  if (!chave) return res.status(503).json({ erro: 'Voz do Papai Noel ainda não configurada' });

  const bruto = String((req.method === 'POST' ? req.body?.texto : req.query?.texto) || '');
  const texto = bruto.replace(/[<>&]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 600);
  if (!texto) return res.status(400).json({ erro: 'Texto vazio' });

  const voz = process.env.ELEVENLABS_VOICE_ID || VOZ_PADRAO;
  try {
    const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voz)}?output_format=mp3_44100_64`, {
      method: 'POST',
      headers: { 'xi-api-key': chave, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
      body: JSON.stringify({
        text: texto,
        model_id: 'eleven_multilingual_v2',
        language_code: 'pt',
        voice_settings: { stability: 0.45, similarity_boost: 0.8, style: 0.35, use_speaker_boost: true, speed: 0.92 },
      }),
    });
    if (!r.ok) {
      const det = (await r.text()).slice(0, 200);
      return res.status(r.status === 401 || r.status === 429 ? r.status : 502).json({ erro: 'Não foi possível gerar a voz agora', detalhe: det });
    }
    const mp3 = Buffer.from(await r.arrayBuffer());
    if (mp3.length < 1000) throw new Error('Áudio vazio');
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Length', mp3.length);
    res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=31536000, immutable');
    return res.status(200).send(mp3);
  } catch (e) {
    return res.status(502).json({ erro: 'Não foi possível gerar a voz agora', detalhe: String(e?.message || e).slice(0, 200) });
  }
}

/**
 * Notulensi Generator
 * Converts raw transcript to structured meeting notes using Claude AI
 */

class NotulensiGenerator {
  constructor() {
    this.apiUrl = 'https://api.anthropic.com/v1/messages';
  }

  /**
   * Generate notulensi from transcript
   * @param {string} transcript 
   * @param {Object} options - { apiKey, meetingTitle, meetingDate, attendees, additionalContext }
   */
  async generate(transcript, options = {}) {
    const { apiKey, meetingTitle = '', meetingDate = '', attendees = '', additionalContext = '' } = options;

    if (!apiKey) throw new Error('API key Anthropic diperlukan untuk membuat notulensi.');
    if (!transcript || transcript.trim().length < 50) throw new Error('Transkrip terlalu pendek untuk dibuat notulensi.');

    const contextParts = [];
    if (meetingTitle) contextParts.push(`Judul Rapat: ${meetingTitle}`);
    if (meetingDate) contextParts.push(`Tanggal: ${meetingDate}`);
    if (attendees) contextParts.push(`Peserta: ${attendees}`);
    if (additionalContext) contextParts.push(`Konteks Tambahan: ${additionalContext}`);

    const contextBlock = contextParts.length > 0
      ? `Informasi Rapat:\n${contextParts.join('\n')}\n\n`
      : '';

    const systemPrompt = `Anda adalah sekretaris profesional berpengalaman yang ahli dalam membuat notulensi rapat yang terstruktur, jelas, dan komprehensif dalam Bahasa Indonesia. 

Tugas Anda: Ubah transkrip rapat yang kasar (hasil transkripsi otomatis) menjadi notulensi rapat yang rapi dan profesional.

Format notulensi yang harus dibuat:
1. HEADER RAPAT (judul, tanggal, waktu jika ada, tempat jika ada, peserta jika teridentifikasi)
2. AGENDA / TOPIK YANG DIBAHAS
3. JALANNYA RAPAT (ringkasan diskusi per topik secara kronologis)
4. KEPUTUSAN YANG DIAMBIL (daftar keputusan konkret)
5. TINDAK LANJUT / ACTION ITEMS (siapa melakukan apa, target waktu jika disebutkan)
6. KESIMPULAN

Aturan penting:
- Gunakan bahasa formal dan profesional
- Hilangkan filler words, repetisi, dan tangential conversation
- Pertahankan semua informasi penting dan keputusan
- Jika ada nama peserta yang disebutkan, masukkan dalam konteks yang tepat
- Format dengan heading yang jelas menggunakan markdown
- Jika ada hal yang tidak jelas dari transkrip, tandai dengan [tidak jelas] bukan mengarang
- Buat ringkasan yang proporsional dengan panjang rapat`;

    const userMessage = `${contextBlock}Berikut adalah transkrip rapat yang perlu diubah menjadi notulensi rapih:

---
${transcript}
---

Tolong buat notulensi rapat yang profesional dan terstruktur dari transkrip di atas.`;

    const response = await fetch(this.apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-calls': 'true',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
      }),
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(`Anthropic API Error: ${errData.error?.message || response.statusText}`);
    }

    const data = await response.json();
    return data.content?.[0]?.text || '';
  }
}

window.NotulensiGenerator = NotulensiGenerator;

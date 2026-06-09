/**
 * Transcriber Engine
 * Handles audio chunking and transcription via Web Speech API or OpenAI Whisper
 */

class AudioTranscriber {
  constructor(options = {}) {
    this.chunkDuration = options.chunkDuration || 55; // seconds per chunk (safe under 60s)
    this.onProgress = options.onProgress || (() => {});
    this.onChunkDone = options.onChunkDone || (() => {});
    this.onError = options.onError || (() => {});
    this.cancelled = false;
  }

  cancel() {
    this.cancelled = true;
  }

  /**
   * Split an AudioBuffer into chunks of `chunkDuration` seconds
   */
  splitAudioBuffer(audioBuffer, chunkDurationSec) {
    const sampleRate = audioBuffer.sampleRate;
    const chunkSize = Math.floor(sampleRate * chunkDurationSec);
    const numChannels = audioBuffer.numberOfChannels;
    const chunks = [];
    let offset = 0;
    const totalSamples = audioBuffer.length;

    while (offset < totalSamples) {
      const end = Math.min(offset + chunkSize, totalSamples);
      const length = end - offset;
      const offlineCtx = new OfflineAudioContext(numChannels, length, sampleRate);
      const chunkBuffer = offlineCtx.createBuffer(numChannels, length, sampleRate);
      for (let ch = 0; ch < numChannels; ch++) {
        const srcData = audioBuffer.getChannelData(ch).slice(offset, end);
        chunkBuffer.copyToChannel(srcData, ch);
      }
      chunks.push({ buffer: chunkBuffer, startSec: offset / sampleRate, endSec: end / sampleRate });
      offset = end;
    }
    return chunks;
  }

  /**
   * Convert AudioBuffer to WAV Blob
   */
  audioBufferToWav(buffer) {
    const numChannels = Math.min(buffer.numberOfChannels, 1); // mono for Whisper efficiency
    const sampleRate = buffer.sampleRate;
    const format = 1; // PCM
    const bitDepth = 16;

    let samples;
    if (buffer.numberOfChannels === 1) {
      samples = buffer.getChannelData(0);
    } else {
      // Mix down to mono
      const left = buffer.getChannelData(0);
      const right = buffer.getChannelData(1);
      samples = new Float32Array(left.length);
      for (let i = 0; i < left.length; i++) {
        samples[i] = (left[i] + right[i]) / 2;
      }
    }

    const dataLength = samples.length * 2;
    const arrayBuffer = new ArrayBuffer(44 + dataLength);
    const view = new DataView(arrayBuffer);

    const writeString = (offset, str) => {
      for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
    };

    writeString(0, 'RIFF');
    view.setUint32(4, 36 + dataLength, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, format, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * numChannels * (bitDepth / 8), true);
    view.setUint16(32, numChannels * (bitDepth / 8), true);
    view.setUint16(34, bitDepth, true);
    writeString(36, 'data');
    view.setUint32(40, dataLength, true);

    let offset = 44;
    for (let i = 0; i < samples.length; i++, offset += 2) {
      const s = Math.max(-1, Math.min(1, samples[i]));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    }

    return new Blob([arrayBuffer], { type: 'audio/wav' });
  }

  /**
   * Decode audio file to AudioBuffer
   */
  async decodeFile(file) {
    const arrayBuffer = await file.arrayBuffer();
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    try {
      const decoded = await audioCtx.decodeAudioData(arrayBuffer);
      await audioCtx.close();
      return decoded;
    } catch (e) {
      await audioCtx.close();
      throw new Error(`Gagal decode audio: ${e.message}. Pastikan file adalah format audio yang valid (MP3, WAV, M4A, OGG).`);
    }
  }

  /**
   * Transcribe a single WAV blob using OpenAI Whisper API
   */
  async transcribeChunkWithWhisper(wavBlob, apiKey, language, chunkIndex, totalChunks) {
    const formData = new FormData();
    formData.append('file', wavBlob, `chunk_${chunkIndex}.wav`);
    formData.append('model', 'whisper-1');
    if (language && language !== 'auto') {
      formData.append('language', language);
    }
    formData.append('response_format', 'text');

    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}` },
      body: formData,
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Whisper API error (chunk ${chunkIndex + 1}/${totalChunks}): ${errText}`);
    }

    return await response.text();
  }

  /**
   * Main transcription method
   * @param {File} file - audio file
   * @param {Object} options - { method: 'whisper'|'webspeech', apiKey, language }
   */
  async transcribe(file, options = {}) {
    this.cancelled = false;
    const { method = 'whisper', apiKey = '', language = 'id' } = options;

    this.onProgress({ phase: 'decode', percent: 0, message: 'Mendekode file audio...' });

    let audioBuffer;
    try {
      audioBuffer = await this.decodeFile(file);
    } catch (e) {
      throw e;
    }

    const totalDuration = audioBuffer.duration;
    this.onProgress({ phase: 'decode', percent: 100, message: `Audio berhasil didekode. Durasi: ${this.formatDuration(totalDuration)}` });

    const chunks = this.splitAudioBuffer(audioBuffer, this.chunkDuration);
    const totalChunks = chunks.length;
    
    this.onProgress({ phase: 'split', percent: 0, message: `Audio dibagi menjadi ${totalChunks} segmen` });

    let fullTranscript = '';

    for (let i = 0; i < totalChunks; i++) {
      if (this.cancelled) throw new Error('Transkripsi dibatalkan oleh pengguna.');

      const chunk = chunks[i];
      const percent = Math.round((i / totalChunks) * 100);
      this.onProgress({
        phase: 'transcribe',
        percent,
        message: `Transkripsi segmen ${i + 1} dari ${totalChunks} (${this.formatDuration(chunk.startSec)} - ${this.formatDuration(chunk.endSec)})`,
        chunkIndex: i,
        totalChunks,
      });

      const wavBlob = this.audioBufferToWav(chunk.buffer);

      let chunkText = '';
      if (method === 'whisper') {
        chunkText = await this.transcribeChunkWithWhisper(wavBlob, apiKey, language, i, totalChunks);
      } else {
        throw new Error('Metode tidak dikenali');
      }

      chunkText = chunkText.trim();
      if (chunkText) {
        fullTranscript += (fullTranscript ? ' ' : '') + chunkText;
      }

      this.onChunkDone({
        chunkIndex: i,
        totalChunks,
        text: chunkText,
        startSec: chunk.startSec,
        endSec: chunk.endSec,
      });
    }

    this.onProgress({ phase: 'done', percent: 100, message: 'Transkripsi selesai!' });

    return fullTranscript;
  }

  formatDuration(sec) {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = Math.floor(sec % 60);
    if (h > 0) return `${h}j ${m}m ${s}d`;
    if (m > 0) return `${m}m ${s}d`;
    return `${s}d`;
  }
}

window.AudioTranscriber = AudioTranscriber;

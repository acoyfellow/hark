const SOURCE_RATE = 24000;
const LEVEL_EVERY = 6;

class HarkPlayback extends AudioWorkletProcessor {
  constructor() {
    super();
    this.queue = [];
    this.head = 0;
    this.gain = 1;
    this.target = 1;
    this.turn = 0;
    this.ending = -1;
    this.blocks = 0;
    this.peak = 0;
    this.playing = false;
    this.carry = 0;
    this.port.onmessage = (event) => this.receive(event.data);
  }

  receive(message) {
    if (!message) return;

    if (message.type === 'push') {
      if (message.turn < this.turn) return;

      if (message.turn > this.turn) {
        this.queue = [];
        this.head = 0;
        this.turn = message.turn;
        this.ending = -1;
      }

      this.queue.push(this.resample(new Int16Array(message.buffer)));
      this.target = this.target < 1 ? this.target : 1;
    } else if (message.type === 'end') {
      if (message.turn >= this.turn) {
        this.turn = message.turn;
        this.ending = message.turn;

        if (this.queue.length === 0) this.drained();
      }
    } else if (message.type === 'clear') {
      this.queue = [];
      this.head = 0;
      this.turn = Math.max(this.turn, message.turn + 1);
      this.ending = -1;
      this.target = 1;
      this.gain = 1;
    } else if (message.type === 'duck') {
      this.target = message.on ? 0.22 : 1;
    }
  }

  resample(pcm) {
    const ratio = SOURCE_RATE / sampleRate;
    const length = Math.floor((pcm.length - 1) / ratio);
    const out = new Float32Array(Math.max(0, length));

    for (let index = 0; index < out.length; index += 1) {
      const at = index * ratio;
      const base = Math.floor(at);
      const fraction = at - base;
      const left = pcm[base] / 0x8000;
      const right = pcm[Math.min(pcm.length - 1, base + 1)] / 0x8000;

      out[index] = left + (right - left) * fraction;
    }

    return out;
  }

  drained() {
    this.port.postMessage({ type: 'drained', turn: this.ending });
    this.ending = -1;
  }

  process(_inputs, outputs) {
    const output = outputs[0];
    const left = output[0];
    let energy = 0;

    for (let index = 0; index < left.length; index += 1) {
      let sample = 0;
      const chunk = this.queue[0];

      if (chunk) {
        sample = chunk[this.head];
        this.head += 1;

        if (this.head >= chunk.length) {
          this.queue.shift();
          this.head = 0;

          if (this.queue.length === 0 && this.ending >= 0) this.drained();
        }
      }

      this.gain += (this.target - this.gain) * 0.004;
      sample *= this.gain;
      energy += sample * sample;

      for (let channel = 0; channel < output.length; channel += 1) output[channel][index] = sample;
    }

    const rms = Math.sqrt(energy / left.length);

    this.peak = Math.max(this.peak * 0.88, rms);
    this.blocks += 1;

    if (this.blocks % LEVEL_EVERY === 0) this.port.postMessage({ type: 'level', value: this.peak });

    return true;
  }
}

registerProcessor('hark-playback', HarkPlayback);

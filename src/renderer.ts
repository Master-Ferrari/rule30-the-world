/**
 * WebGL2 renderer — ping-pong simulation + history display.
 *
 * Pipeline per frame:
 *   1. Upload initial row → pingPong[0], copy to history row 0
 *   2. For each generation g:
 *      - sim shader reads pingPong[read], writes pingPong[write]
 *      - copy pingPong[write] → history row g+1
 *      - swap read/write
 *   3. Display shader renders history → screen (1:1 pixels)
 */

import simVertSrc from "./shaders/sim.vert.glsl?raw";
import simFragSrc from "./shaders/sim.frag.glsl?raw";
import displayFragSrc from "./shaders/display.frag.glsl?raw";

export class Renderer {
  private gl: WebGL2RenderingContext;
  private canvas: HTMLCanvasElement;

  // Textures
  private truthTableTex!: WebGLTexture;
  private pingPong!: [WebGLTexture, WebGLTexture];
  private historyTex!: WebGLTexture;

  // FBOs
  private simFbo!: WebGLFramebuffer;
  private copyFbo!: WebGLFramebuffer;

  // Programs
  private simProgram!: WebGLProgram;
  private displayProgram!: WebGLProgram;

  // Empty VAO for attributeless draw
  private vao!: WebGLVertexArrayObject;

  // State
  private gridWidth = 0;
  private totalRows = 0;
  private leftCtx = 1;
  private ruleWidth = 3;
  private initialRowData = new Uint8Array(0);

  // Uniform locations (sim)
  private uSimCurrentGen!: WebGLUniformLocation;
  private uSimTruthTable!: WebGLUniformLocation;
  private uSimWidth!: WebGLUniformLocation;
  private uSimLeftCtx!: WebGLUniformLocation;
  private uSimRuleWidth!: WebGLUniformLocation;

  // Uniform locations (display)
  private uDispHistory!: WebGLUniformLocation;
  private uDispRows!: WebGLUniformLocation;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const gl = canvas.getContext("webgl2", { antialias: false, preserveDrawingBuffer: true });
    if (!gl) throw new Error("WebGL2 not supported");
    this.gl = gl;
  }

  init(): void {
    const gl = this.gl;

    // Programs
    this.simProgram = this.createProgram(simVertSrc, simFragSrc);
    this.displayProgram = this.createProgram(simVertSrc, displayFragSrc);

    // Sim uniforms
    this.uSimCurrentGen = gl.getUniformLocation(this.simProgram, "u_currentGen")!;
    this.uSimTruthTable = gl.getUniformLocation(this.simProgram, "u_truthTable")!;
    this.uSimWidth = gl.getUniformLocation(this.simProgram, "u_width")!;
    this.uSimLeftCtx = gl.getUniformLocation(this.simProgram, "u_leftCtx")!;
    this.uSimRuleWidth = gl.getUniformLocation(this.simProgram, "u_ruleWidth")!;

    // Display uniforms
    this.uDispHistory = gl.getUniformLocation(this.displayProgram, "u_history")!;
    this.uDispRows = gl.getUniformLocation(this.displayProgram, "u_rows")!;

    // VAO (empty — we use gl_VertexID)
    this.vao = gl.createVertexArray()!;

    // FBOs
    this.simFbo = gl.createFramebuffer()!;
    this.copyFbo = gl.createFramebuffer()!;

    // Truth table texture (placeholder)
    this.truthTableTex = this.createTex(8, 1);
  }

  /** Recreate pingPong + history textures for new dimensions. */
  resize(width: number, steps: number): void {
    this.gridWidth = width;
    this.totalRows = steps + 1;

    // Canvas = 1:1 with grid
    this.canvas.width = width;
    this.canvas.height = this.totalRows;

    // Ping-pong (width × 1)
    this.pingPong = [this.createTex(width, 1), this.createTex(width, 1)];

    // History (width × totalRows)
    this.historyTex = this.createTex(width, this.totalRows);
    this.initialRowData = new Uint8Array(width);
  }

  /** Upload truth table. */
  uploadTruthTable(table: Uint8Array, leftCtx: number, rightCtx: number): void {
    const gl = this.gl;
    this.leftCtx = leftCtx;
    this.ruleWidth = leftCtx + 1 + rightCtx;

    // Convert 0/1 → 0/255
    const data = new Uint8Array(table.length);
    for (let i = 0; i < table.length; i++) {
      data[i] = table[i] ? 255 : 0;
    }

    gl.bindTexture(gl.TEXTURE_2D, this.truthTableTex);
    gl.texImage2D(
      gl.TEXTURE_2D, 0, gl.R8,
      table.length, 1, 0,
      gl.RED, gl.UNSIGNED_BYTE, data,
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  /** Fill pingPong[0] with random state only in the center band. */
  randomize(width: number, seed: number, centerBandWidth: number): void {
    const data = new Uint8Array(width);
    const activeWidth = Math.max(0, Math.min(width, Math.floor(centerBandWidth)));
    const start = Math.floor((width - activeWidth) / 2);
    const end = start + activeWidth;
    let state = (Math.floor(seed) >>> 0) || 0x9e3779b9;
    for (let i = start; i < end; i++) {
      state ^= state << 13;
      state ^= state >>> 17;
      state ^= state << 5;
      state >>>= 0;
      data[i] = (state & 1) === 1 ? 255 : 0;
    }
    const gl = this.gl;
    this.initialRowData = data;
    gl.bindTexture(gl.TEXTURE_2D, this.pingPong[0]);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, width, 1, gl.RED, gl.UNSIGNED_BYTE, this.initialRowData);
  }

  /** Run full simulation: N steps via ping-pong, store in history. */
  simulate(steps: number): void {
    const gl = this.gl;
    const width = this.gridWidth;
    let readIdx = 0;
    let writeIdx = 1;

    // Always restore generation 0 before each full run.
    gl.bindTexture(gl.TEXTURE_2D, this.pingPong[0]);
    gl.texSubImage2D(
      gl.TEXTURE_2D, 0, 0, 0,
      width, 1,
      gl.RED, gl.UNSIGNED_BYTE, this.initialRowData,
    );

    // Copy gen 0 into history row 0
    this.copyRowToHistory(this.pingPong[0], 0);

    // Set up sim program
    gl.useProgram(this.simProgram);
    gl.uniform1i(this.uSimCurrentGen, 0);
    gl.uniform1i(this.uSimTruthTable, 1);
    gl.uniform1i(this.uSimWidth, width);
    gl.uniform1i(this.uSimLeftCtx, this.leftCtx);
    gl.uniform1i(this.uSimRuleWidth, this.ruleWidth);

    // Bind truth table to texture unit 1
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.truthTableTex);

    gl.bindVertexArray(this.vao);

    for (let g = 0; g < steps; g++) {
      // Bind input (previous gen)
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.pingPong[readIdx]);

      // Bind output FBO
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.simFbo);
      gl.framebufferTexture2D(
        gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0,
        gl.TEXTURE_2D, this.pingPong[writeIdx], 0,
      );

      gl.viewport(0, 0, width, 1);
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      // Copy result to history
      this.copyRowToHistory(this.pingPong[writeIdx], g + 1);

      // Swap
      [readIdx, writeIdx] = [writeIdx, readIdx];
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  /** Render history texture to screen. */
  display(): void {
    const gl = this.gl;

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);

    gl.useProgram(this.displayProgram);
    gl.uniform1i(this.uDispHistory, 0);
    gl.uniform1i(this.uDispRows, this.totalRows);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.historyTex);

    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  // ── helpers ──────────────────────────────────────────────────

  private copyRowToHistory(srcTex: WebGLTexture, dstRow: number): void {
    const gl = this.gl;

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.copyFbo);
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D, srcTex, 0,
    );

    gl.bindTexture(gl.TEXTURE_2D, this.historyTex);
    gl.copyTexSubImage2D(
      gl.TEXTURE_2D, 0,
      0, dstRow,
      0, 0,
      this.gridWidth, 1,
    );
  }

  private createTex(w: number, h: number): WebGLTexture {
    const gl = this.gl;
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(
      gl.TEXTURE_2D, 0, gl.R8,
      w, h, 0,
      gl.RED, gl.UNSIGNED_BYTE, null,
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return tex;
  }

  private createProgram(vertSrc: string, fragSrc: string): WebGLProgram {
    const gl = this.gl;
    const vs = this.compileShader(gl.VERTEX_SHADER, vertSrc);
    const fs = this.compileShader(gl.FRAGMENT_SHADER, fragSrc);
    const prog = gl.createProgram()!;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      throw new Error("Link error: " + gl.getProgramInfoLog(prog));
    }
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    return prog;
  }

  private compileShader(type: number, src: string): WebGLShader {
    const gl = this.gl;
    const sh = gl.createShader(type)!;
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      const info = gl.getShaderInfoLog(sh);
      gl.deleteShader(sh);
      throw new Error("Shader compile error: " + info);
    }
    return sh;
  }
}

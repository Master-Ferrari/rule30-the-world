#version 300 es
precision highp float;

uniform sampler2D u_currentGen;   // previous generation (width × 1)
uniform sampler2D u_truthTable;   // truth table (nPatterns × 1)
uniform int u_width;              // grid width
uniform int u_leftCtx;            // left context radius
uniform int u_ruleWidth;          // total neighborhood width

#define MAX_RULE_WIDTH 14

out float fragColor;

void main() {
    int x = int(gl_FragCoord.x);

    // Build pattern index from neighborhood (MSB = leftmost)
    // Out-of-bounds cells read as 0
    int idx = 0;
    for (int j = 0; j < MAX_RULE_WIDTH; j++) {
        if (j >= u_ruleWidth) break;
        int nx = x - u_leftCtx + j;
        int bit = 0;
        if (nx >= 0 && nx < u_width) {
            float cell = texelFetch(u_currentGen, ivec2(nx, 0), 0).r;
            bit = cell > 0.5 ? 1 : 0;
        }
        idx = (idx << 1) | bit;
    }

    // Look up output in truth table
    float result = texelFetch(u_truthTable, ivec2(idx, 0), 0).r;
    fragColor = result > 0.5 ? 1.0 : 0.0;
}

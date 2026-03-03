#version 300 es
precision highp float;

uniform sampler2D u_history;
uniform int u_rows;
uniform int u_head;      // ring-buffer offset: oldest row in history
uniform int u_colored;   // 0 = B&W, 1 = colored by rule
uniform int u_numColors; // number of distinct rule lines

out vec4 fragColor;

// HSL → RGB (h in [0,1], s in [0,1], l in [0,1])
vec3 hsl2rgb(float h, float s, float l) {
    float c = (1.0 - abs(2.0 * l - 1.0)) * s;
    float hp = h * 6.0;
    float x = c * (1.0 - abs(mod(hp, 2.0) - 1.0));
    vec3 rgb;
    if      (hp < 1.0) rgb = vec3(c, x, 0.0);
    else if (hp < 2.0) rgb = vec3(x, c, 0.0);
    else if (hp < 3.0) rgb = vec3(0.0, c, x);
    else if (hp < 4.0) rgb = vec3(0.0, x, c);
    else if (hp < 5.0) rgb = vec3(x, 0.0, c);
    else               rgb = vec3(c, 0.0, x);
    float m = l - c * 0.5;
    return rgb + m;
}

void main() {
    int cx = int(gl_FragCoord.x);
    int cy = u_rows - 1 - int(gl_FragCoord.y);
    int row = (u_head + cy) % u_rows;

    float v = texelFetch(u_history, ivec2(cx, row), 0).r;
    int colorIdx = int(v * 255.0 + 0.5); // 0=dead, 1..254=rule color, 255=initial

    if (colorIdx == 0) {
        // dead cell
        fragColor = vec4(0.0, 0.0, 0.0, 1.0);
    } else if (u_colored == 1 && u_numColors > 0 && colorIdx <= u_numColors) {
        // alive cell created by a known rule line → hue-coded
        float hue = float(colorIdx - 1) / float(u_numColors);
        fragColor = vec4(hsl2rgb(hue, 0.8, 0.6), 1.0);
    } else {
        // alive cell: B&W mode, or initial random cell, or colorIdx out of range
        fragColor = vec4(0.878, 0.878, 0.878, 1.0);
    }
}

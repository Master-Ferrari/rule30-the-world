#version 300 es
precision highp float;

uniform sampler2D u_history;
uniform int u_rows;
uniform int u_head;  // ring-buffer offset: oldest row in history

out vec4 fragColor;

void main() {
    int cx = int(gl_FragCoord.x);
    int cy = u_rows - 1 - int(gl_FragCoord.y);
    int row = (u_head + cy) % u_rows;

    float v = texelFetch(u_history, ivec2(cx, row), 0).r;
    // alive = light, dead = black
    fragColor = v > 0.5 ? vec4(0.878, 0.878, 0.878, 1.0) : vec4(0.0, 0.0, 0.0, 1.0);
}

#version 300 es
// Fullscreen triangle — 3 vertices, no attributes
void main() {
    vec2 p = vec2(
        float((gl_VertexID & 1) * 4 - 1),
        float((gl_VertexID >> 1) * 4 - 1)
    );
    gl_Position = vec4(p, 0.0, 1.0);
}

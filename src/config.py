"""Application configuration."""


class Config:
    # Grid
    GRID_WIDTH = 201
    STEPS = 100

    # Rule
    RULE_NUMBER = 30
    MAX_CONTEXT = 4

    # Display
    CELL_SIZE = 4
    COLOR_ALIVE = "#000000"
    COLOR_DEAD = "#ffffff"
    COLOR_BG = "#f0f0f0"

    # Window
    WINDOW_TITLE = "Rule Predictor — Cellular Automaton"

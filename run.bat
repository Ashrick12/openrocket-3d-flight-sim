@echo off
title OpenRocket 3D Visualizer
echo Launching OpenRocket 3D Flight Visualizer...

where python >nul 2>nul
if %ERRORLEVEL% EQU 0 (
    python serve.py
) else (
    start index.html
)


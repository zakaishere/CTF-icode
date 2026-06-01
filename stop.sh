#!/usr/bin/env bash
# Stop backend and frontend
pkill -f "icode-ctf-backend" 2>/dev/null && echo "✓ Backend stopped" || echo "Backend not running"
pkill -f "next dev\|next start"  2>/dev/null && echo "✓ Frontend stopped" || echo "Frontend not running"

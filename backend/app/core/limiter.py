"""
USES: API protection and flood control.
SUPPORT: Implements an in-memory sliding window rate limiter to prevent denial-of-service (DoS) scenarios and ensure fair resource allocation.
"""
from slowapi import Limiter  # Import the core Limiter class for request throttling
from slowapi.util import get_remote_address  # Import utility to identify clients by IP address

# Define the global limiter instance
# Identifies clients by IP address to apply per-user throttling
limiter = Limiter(key_func=get_remote_address)  # Initialize limiter; standard config for enterprise APIs

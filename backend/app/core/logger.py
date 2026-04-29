"""
USES: System-wide structured logging utility.
SUPPORT: Provides consistent log formatting for both console and file output, enabling efficient audit trails during enterprise operations.
"""
import logging  # Import standard logging library for stream management
import sys  # Import sys for routing logs to standard output/error
from logging.handlers import RotatingFileHandler  # Import handler for fixed-size log files with rotation
from app.core.config import config  # Import configuration to get log level and file paths

# Configuration Section
# Defines how the logs will appear (Timestamp, Log Level, Message)
LOG_FORMAT = "%(asctime)s - %(name)s - %(levelname)s - %(message)s"  # Standardized production log format

def setup_logger():  # Orchestration function for logger initialization
    """
    Initializes a production-grade logger with dual handlers (Stream + File).
    """
    root_logger = logging.getLogger()  # Access the top-level logger instance
    root_logger.setLevel(getattr(logging, config.LOG_LEVEL.upper()))  # Set global verbosity based on config

    # Handler 1: Standard Output (Console)
    # Allows developers to see live logs in terminal/Docker logs
    console_handler = logging.StreamHandler(sys.stdout)  # Create a stream-based log consumer
    console_handler.setFormatter(logging.Formatter(LOG_FORMAT))  # Apply the unified format
    root_logger.addHandler(console_handler)  # Link handler to the root logger

    # Handler 2: Rotating File Handler
    # Ensures logs are persisted for debugging without filling up disk space
    file_handler = RotatingFileHandler(
        config.LOG_FILE,  # Define target file path (e.g., app.log)
        maxBytes=10*1024*1024,  # Constraint: Rotate at 10 MegaBytes
        backupCount=5  # Retain only the 5 most recent log files
    )
    file_handler.setFormatter(logging.Formatter(LOG_FORMAT))  # Apply the unified format
    root_logger.addHandler(file_handler)  # Link handler to the root logger

    return root_logger  # Return the configured logger agent

# Global instance for app-wide import
logger = setup_logger()  # Initialize the logger immediately for early-boot logging

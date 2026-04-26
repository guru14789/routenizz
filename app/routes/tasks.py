from fastapi import APIRouter, HTTPException, Depends
from celery.result import AsyncResult
from app.celery_worker import celery_app
from app.utils.firebase_auth import require_admin
from app.utils.logger import logger

router = APIRouter()

@router.get("/status/{task_id}")
async def get_task_status(task_id: str, current_user: dict = Depends(require_admin)):
    """
    Checks the status of a background VRP optimization task.
    """
    try:
        task_result = AsyncResult(task_id, app=celery_app)
        
        response = {
            "task_id": task_id,
            "status": task_result.status,
            "result": None
        }

        if task_result.status == "SUCCESS":
            response["result"] = task_result.result
        elif task_result.status == "FAILURE":
            response["error"] = str(task_result.info)
            logger.error(f"Task {task_id} failed: {task_result.info}")

        return response
    except Exception as e:
        logger.error(f"Error checking task {task_id}: {e}")
        raise HTTPException(status_code=500, detail="Internal status check failure")

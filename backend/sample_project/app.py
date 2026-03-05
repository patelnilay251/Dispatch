from flask import Flask, request, jsonify
from models import TodoStore

app = Flask(__name__)
store = TodoStore()


@app.route("/todos", methods=["GET"])
def list_todos():
    return jsonify(store.get_all())


@app.route("/todos", methods=["POST"])
def create_todo():
    data = request.get_json()
    # BUG: no validation on input
    todo = store.add(data["title"])
    return jsonify(todo)


@app.route("/todos/<int:todo_id>", methods=["DELETE"])
def delete_todo(todo_id):
    store.delete(todo_id)
    # BUG: no error handling if id doesn't exist
    return jsonify({"status": "deleted"})


if __name__ == "__main__":
    app.run(debug=True, port=3000)
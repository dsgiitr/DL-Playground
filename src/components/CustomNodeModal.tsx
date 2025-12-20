import {useState } from "react";

type IOItem = {
  id: string;
  label: string;
};

type CustomNodeModalProps = {
  open: boolean;
  onClose: () => void;
  onSave: (data: {
    nodeName: string;
    inputs: IOItem[];
    outputs: IOItem[];
  }) => void;
  inputs: IOItem[];
  outputs: IOItem[];
};

export default function CustomNodeModal({
  open,
  onClose,
  onSave,
  inputs,
  outputs,
}: CustomNodeModalProps) {
const [nodeName, setNodeName] = useState("");
const [inputList, setInputList] = useState<IOItem[]>([]);
const [outputList, setOutputList] = useState<IOItem[]>([]);

if (!open) return null;

// Use props directly or reset on open
const displayInputs = open ? inputs : inputList;
const displayOutputs = open ? outputs : outputList;

  return (
    <>
      <style>
        {`
          .modal-overlay {
            position: fixed;
            inset: 0;
            background: rgba(0, 0, 0, 0.65);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 1000;
          }

          .modal {
            background: #1e1e1e;
            color: #ffffff;
            padding: 30px;
            width: 400px;
            border-radius: 8px;
            box-shadow: 0 20px 40px rgba(0,0,0,0.6);
          }

          .modal h3 {
            margin: 0 0 16px;
          }

          .section {
            margin-bottom: 14px;
          }

          .section h4 {
            margin: 0 0 6px;
            font-size: 14px;
            color: #bbb;
          }

          .section label {
            font-size: 13px;
            color: #bbb;
          }

          .section input {
            width: 100%;
            margin-top: 6px;
            padding: 8px;
            background: #2a2a2a;
            border: 1px solid #444;
            border-radius: 4px;
            color: #fff;
          }

          .section input:focus {
            outline: none;
            border-color: #64ffda;
          }

          .actions {
            display: flex;
            justify-content: flex-end;
            gap: 10px;
            margin-top: 18px;
          }

          .actions button {
            padding: 6px 12px;
            border-radius: 4px;
            border: 1px solid #444;
            cursor: pointer;
            background: #333;
            color: #fff;
          }

          .actions button:disabled {
            opacity: 0.5;
            cursor: not-allowed;
          }

          .actions button:hover:not(:disabled) {
            background: #444;
          }
        `}
      </style>

      <div className="modal-overlay">
        <div className="modal">
          <h3>Create Custom Node</h3>

          <div className="section">
            <label>Node Name</label>
            <input
              value={nodeName}
              onChange={(e) => setNodeName(e.target.value)}
              placeholder="MyCustomNode"
            />
          </div>

          <div className="section">
            <h4>Inputs</h4>
            {displayInputs.length === 0 && <p>No inputs selected</p>}
            {displayInputs.map((input, idx) => (
              <input
                key={input.id}
                value={input.label}
                placeholder={`Input ${idx + 1}`}
                onChange={(e) => {
                  const copy = [...displayInputs];
                  copy[idx] = { ...copy[idx], label: e.target.value };
                  setInputList(copy);
                }}
              />
            ))}
          </div>

          <div className="section">
            <h4>Outputs</h4>
            {displayOutputs.length === 0 && <p>No outputs selected</p>}
            {displayOutputs.map((output, idx) => (
              <input
                key={output.id}
                value={output.label}
                placeholder={`Output ${idx + 1}`}
                onChange={(e) => {
                  const copy = [...displayOutputs];
                  copy[idx] = { ...copy[idx], label: e.target.value };
                  setOutputList(copy);
                }}
              />
            ))}
          </div>

          <div className="actions">
            <button
              onClick={() =>
                onSave({
                  nodeName,
                  inputs: inputList,
                  outputs: outputList,
                })
              }
              disabled={!nodeName.trim()}
            >
              Save
            </button>
            <button onClick={onClose}>Cancel</button>
          </div>
        </div>
      </div>
    </>
  );
}

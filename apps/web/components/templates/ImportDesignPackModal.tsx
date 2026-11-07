"use client";

import React, { useState } from "react";
import { 
  Upload, X, CheckCircle2, AlertTriangle, FileArchive, 
  Layers, Eye, ShieldCheck, Sparkles, Loader2 
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

interface ImportDesignPackModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function ImportDesignPackModal({ isOpen, onClose }: ImportDesignPackModalProps) {
  const queryClient = useQueryClient();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [importResult, setImportResult] = useState<any | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.name.endsWith(".zip")) {
        setErrorMessage("Please select a valid .zip design package archive.");
        setSelectedFile(null);
        return;
      }
      setSelectedFile(file);
      setErrorMessage(null);
      setImportResult(null);
    }
  };

  const handleUploadAndImport = async () => {
    if (!selectedFile) return;

    setIsUploading(true);
    setErrorMessage(null);

    const formData = new FormData();
    formData.append("file", selectedFile);

    try {
      const res = await fetch("/api/templates/import-pack", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to validate and import design pack");
      }

      setImportResult(data);
      // Invalidate templates query to refresh the list immediately
      queryClient.invalidateQueries({ queryKey: ["workflow-templates"] });
    } catch (err: any) {
      setErrorMessage(err.message || "An unexpected error occurred during import.");
    } finally {
      setIsUploading(false);
    }
  };

  const resetState = () => {
    setSelectedFile(null);
    setImportResult(null);
    setErrorMessage(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl bg-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 bg-zinc-900/50">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              <FileArchive className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-zinc-100">Import Design Template Pack</h3>
              <p className="text-xs text-zinc-400">Canva Pro Lite & External ZIP Package Ingestion</p>
            </div>
          </div>
          <button
            onClick={resetState}
            className="p-1.5 text-zinc-400 hover:text-zinc-100 rounded-lg hover:bg-zinc-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {/* File Picker Area */}
          {!importResult && (
            <div className="space-y-4">
              <label 
                htmlFor="design-pack-file"
                className={`flex flex-col items-center justify-center border-2 border-dashed rounded-xl p-8 cursor-pointer transition-all ${
                  selectedFile 
                    ? "border-indigo-500/50 bg-indigo-950/10" 
                    : "border-zinc-800 hover:border-zinc-700 bg-zinc-900/20"
                }`}
              >
                <Upload className="w-8 h-8 text-indigo-400 mb-3" />
                <span className="text-sm font-semibold text-zinc-200">
                  {selectedFile ? selectedFile.name : "Choose a Canva Design Pack (.zip)"}
                </span>
                <span className="text-xs text-zinc-500 mt-1">
                  {selectedFile 
                    ? `${(selectedFile.size / 1024).toFixed(1)} KB — Click to change` 
                    : "Must contain manifest.json, assets/, and optional preview/"}
                </span>
                <input 
                  id="design-pack-file" 
                  type="file" 
                  accept=".zip" 
                  onChange={handleFileChange} 
                  className="hidden" 
                />
              </label>

              {/* Action Buttons */}
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={resetState}
                  className="px-4 py-2 text-xs font-semibold text-zinc-400 hover:text-zinc-200 bg-zinc-900 rounded-lg hover:bg-zinc-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!selectedFile || isUploading}
                  onClick={handleUploadAndImport}
                  className="flex items-center gap-2 px-5 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-indigo-600/20"
                >
                  {isUploading ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" /> Validating Package...
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="w-3.5 h-3.5" /> Validate & Register Pack
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Validation Error Alert */}
          {errorMessage && (
            <div className="flex items-start gap-3 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">Package Validation Rejected</p>
                <p className="mt-0.5 text-red-300/90">{errorMessage}</p>
              </div>
            </div>
          )}

          {/* Success & Inventory Display */}
          {importResult && (
            <div className="space-y-6">
              {/* Success Badge */}
              <div className="flex items-center gap-3 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                <CheckCircle2 className="w-5 h-5 shrink-0" />
                <div>
                  <h4 className="text-sm font-bold">Design Pack Successfully Registered</h4>
                  <p className="text-xs text-emerald-300/90 mt-0.5">
                    {importResult.message}
                  </p>
                </div>
              </div>

              {/* Template Overview Card */}
              {importResult.template && (
                <div className="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                        {importResult.template.category}
                      </span>
                      <h4 className="text-sm font-bold text-zinc-100 mt-1">
                        {importResult.template.identity.name}
                      </h4>
                      <p className="text-xs text-zinc-400">
                        ID: <code className="text-indigo-400">{importResult.template.identity.id}@{importResult.template.identity.version}</code>
                      </p>
                    </div>
                    <span className="text-[10px] font-mono px-2 py-1 rounded bg-zinc-800 text-zinc-400 border border-zinc-700">
                      isSystem: false
                    </span>
                  </div>

                  <p className="text-xs text-zinc-300 leading-relaxed">
                    {importResult.template.description}
                  </p>

                  <div className="grid grid-cols-2 gap-3 pt-2 border-t border-zinc-800 text-xs text-zinc-400">
                    <div>
                      <span className="text-zinc-500">Format Family:</span> {importResult.template.formatFamily}
                    </div>
                    <div>
                      <span className="text-zinc-500">Story Steps:</span> {importResult.template.storyStructure?.length || 0} beats
                    </div>
                    <div>
                      <span className="text-zinc-500">Resolution:</span> {importResult.template.outputPolicy?.width}×{importResult.template.outputPolicy?.height} (9:16)
                    </div>
                    <div>
                      <span className="text-zinc-500">Licensing:</span> {importResult.manifest?.license?.licenseType || "CANVA_PRO"}
                    </div>
                  </div>
                </div>
              )}

              {/* Asset Inventory Table */}
              {importResult.assetInventory && importResult.assetInventory.length > 0 && (
                <div className="space-y-2">
                  <h5 className="text-xs font-bold text-zinc-300 flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-indigo-400" />
                    Asset Inventory ({importResult.assetInventory.length} Verified Files)
                  </h5>
                  <div className="rounded-xl border border-zinc-800 overflow-hidden">
                    <table className="w-full text-left text-xs text-zinc-400">
                      <thead className="bg-zinc-900/80 text-[11px] uppercase tracking-wider text-zinc-400 border-b border-zinc-800">
                        <tr>
                          <th className="px-3 py-2">Asset ID</th>
                          <th className="px-3 py-2">Role</th>
                          <th className="px-3 py-2">Dimensions</th>
                          <th className="px-3 py-2">Size</th>
                          <th className="px-3 py-2">SHA-256</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-800 bg-zinc-950/40">
                        {importResult.assetInventory.map((asset: any) => (
                          <tr key={asset.assetId} className="hover:bg-zinc-900/30">
                            <td className="px-3 py-2 font-mono text-zinc-200">{asset.assetId}</td>
                            <td className="px-3 py-2">
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-zinc-800 text-zinc-300">
                                {asset.role}
                              </span>
                            </td>
                            <td className="px-3 py-2 font-mono">
                              {asset.dimensions ? `${asset.dimensions.width}×${asset.dimensions.height}` : "—"}
                            </td>
                            <td className="px-3 py-2 font-mono">
                              {(asset.byteLength / 1024).toFixed(1)} KB
                            </td>
                            <td className="px-3 py-2 font-mono text-[10px] text-zinc-500">
                              {asset.sha256.substring(0, 12)}...
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Done button */}
              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={resetState}
                  className="px-5 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition-colors shadow-lg shadow-indigo-600/20"
                >
                  Done
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}


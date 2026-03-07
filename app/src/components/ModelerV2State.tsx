import { useState, useEffect } from 'react';
import { StateProps, StateEnum } from '../App';
import ModelerV2 from './ModelerV2';
import TopRightIcons from '../utilComponents/TopRightIcons';
import { BiHome, BiPlus, BiSave, BiLeftArrowCircle, BiSolidDashboard } from 'react-icons/bi';
import ModalMenu, { ModalMenuElement } from '../utilComponents/ModalMenu';
import FileUpload from '../utilComponents/FileUpload';
import StyledFileUpload from '../utilComponents/StyledFileUpload';
import GraphNameInput from '../utilComponents/GraphNameInput';
import FullScreenIcon from '../utilComponents/FullScreenIcon';
import { toast } from 'react-toastify';
import { loadDCRFromXML, generateXML } from '../utils/dcrToReactFlow';
import { Node, Edge } from 'reactflow';
import { useRef as useReactRef } from 'react';
import Examples from './Examples';

const initGraphName = "DCR-JS Graph V2";

const ModelerV2State = ({ setState, savedGraphs, setSavedGraphs, lastSavedGraph }: StateProps) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const [graphName, setGraphName] = useState<string>(lastSavedGraph.current || initGraphName);
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [xmlContent, setXmlContent] = useState<string>('');
  const nodesRef = useReactRef<Node[]>([]);
  const edgesRef = useReactRef<Edge[]>([]);
  const [examplesOpen, setExamplesOpen] = useState(false);
  const [examplesData, setExamplesData] = useState<Array<string>>([]);

  useEffect(() => {
    const lastGraph = lastSavedGraph.current;
    const xml = lastGraph ? savedGraphs[lastGraph] : undefined;
    if (xml) loadXML(xml, lastGraph);
  }, []);

  useEffect(() => {
    // Fetch examples
    fetch('/dcr-js/examples/generated_examples.txt')
      .then(response => {
        if (!response.ok) {
          throw new Error('Failed to fetch examples status code: ' + response.status);
        }
        return response.text();
      })
      .then(data => {
        let files = data.split('\n');
        files.pop(); // Remove last empty line
        files = files.map(name => name.split('.').slice(0, -1).join('.')); // Shave file extension off
        setExamplesData(files);
      })
      .catch(err => console.error('Failed to load examples:', err));
  }, []);

  // Load XML and convert to React Flow format
  const loadXML = async (xmlString: string, filename?: string) => {
    try {
      const { nodes: rawNodes, edges } = await loadDCRFromXML(xmlString);
      const nodes = rawNodes.map(n => ({
        ...n,
        data: { ...n.data, simulationMode: false, enabled: false },
      }));
      setNodes(nodes);
      setEdges(edges);
      setXmlContent(xmlString);
      if (filename) {
        setGraphName(filename.replace('.xml', ''));
      }
      toast.success('Graph loaded successfully!');
    } catch (error) {
      console.error('Error loading XML:', error);
      toast.error('Failed to load XML file');
    }
  };

  // Save current graph to savedGraphs
  const saveGraph = () => {
    if (nodesRef.current.length === 0) {
      toast.error('No graph to save. Please load an XML file first.');
      return;
    }
    const xml = generateXML(nodesRef.current, edgesRef.current);
    const newSavedGraphs = { ...savedGraphs };
    newSavedGraphs[graphName] = xml;
    setSavedGraphs(newSavedGraphs);
    lastSavedGraph.current = graphName;
    toast.success(`Graph saved as "${graphName}"`);
  };

  // Download XML
  const downloadXML = () => {
    if (nodesRef.current.length === 0) {
      toast.error('No graph to download');
      return;
    }
    const xml = generateXML(nodesRef.current, edgesRef.current);
    const blob = new Blob([xml], { type: 'text/xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${graphName}.xml`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Export as SVG
  const downloadSVG = async () => {
    const nodes = nodesRef.current;
    if (nodes.length === 0) { toast.error('No graph to export'); return; }
    const vpEl = document.querySelector('.react-flow__viewport') as HTMLElement;
    if (!vpEl) return;

    const PAD = 60;
    const minX = Math.min(...nodes.map(n => n.position.x)) - PAD;
    const minY = Math.min(...nodes.map(n => n.position.y)) - PAD;
    const maxX = Math.max(...nodes.map(n => n.position.x + (n.width ?? 140))) + PAD;
    const maxY = Math.max(...nodes.map(n => n.position.y + (n.height ?? 160))) + PAD;
    const W = maxX - minX, H = maxY - minY;

    const origTransform = vpEl.style.transform;
    vpEl.style.transform = `translate(${-minX}px, ${-minY}px) scale(1)`;

    // Hide background and panel elements that shouldn't appear in the export
    const toHide = vpEl.querySelectorAll<HTMLElement>('.react-flow__background, .react-flow__panel');
    toHide.forEach(el => { el.style.visibility = 'hidden'; });

    const { toSvg } = await import('html-to-image');
    const dataUrl = await toSvg(vpEl, { backgroundColor: 'white', width: W, height: H });

    toHide.forEach(el => { el.style.visibility = ''; });
    vpEl.style.transform = origTransform;

    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `${graphName}.svg`;
    a.click();
  };

  // Export as PNG
  const downloadPNG = async () => {
    const nodes = nodesRef.current;
    if (nodes.length === 0) { toast.error('No graph to export'); return; }
    const vpEl = document.querySelector('.react-flow__viewport') as HTMLElement;
    if (!vpEl) return;

    const PAD = 60;
    const minX = Math.min(...nodes.map(n => n.position.x)) - PAD;
    const minY = Math.min(...nodes.map(n => n.position.y)) - PAD;
    const maxX = Math.max(...nodes.map(n => n.position.x + (n.width ?? 140))) + PAD;
    const maxY = Math.max(...nodes.map(n => n.position.y + (n.height ?? 160))) + PAD;
    const W = maxX - minX, H = maxY - minY;

    const origTransform = vpEl.style.transform;
    vpEl.style.transform = `translate(${-minX}px, ${-minY}px) scale(1)`;

    const toHide = vpEl.querySelectorAll<HTMLElement>('.react-flow__background, .react-flow__panel');
    toHide.forEach(el => { el.style.visibility = 'hidden'; });

    const { toPng } = await import('html-to-image');
    const dataUrl = await toPng(vpEl, { backgroundColor: 'white', width: W, height: H, pixelRatio: 2 });

    toHide.forEach(el => { el.style.visibility = ''; });
    vpEl.style.transform = origTransform;

    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `${graphName}.png`;
    a.click();
  };

  // Export as PDF
  const downloadPDF = async () => {
    const nodes = nodesRef.current;
    if (nodes.length === 0) { toast.error('No graph to export'); return; }
    const vpEl = document.querySelector('.react-flow__viewport') as HTMLElement;
    if (!vpEl) return;

    const PAD = 60;
    const minX = Math.min(...nodes.map(n => n.position.x)) - PAD;
    const minY = Math.min(...nodes.map(n => n.position.y)) - PAD;
    const maxX = Math.max(...nodes.map(n => n.position.x + (n.width ?? 140))) + PAD;
    const maxY = Math.max(...nodes.map(n => n.position.y + (n.height ?? 160))) + PAD;
    const W = maxX - minX, H = maxY - minY;

    const origTransform = vpEl.style.transform;
    vpEl.style.transform = `translate(${-minX}px, ${-minY}px) scale(1)`;

    const { toPng } = await import('html-to-image');
    const dataUrl = await toPng(vpEl, { backgroundColor: 'white', width: W, height: H, pixelRatio: 3 });

    vpEl.style.transform = origTransform;

    const { jsPDF } = await import('jspdf');
    const pxToPt = 0.75;
    const pdf = new jsPDF({
      orientation: W > H ? 'landscape' : 'portrait',
      unit: 'pt',
      format: [W * pxToPt, H * pxToPt],
    });
    pdf.addImage(dataUrl, 'PNG', 0, 0, W * pxToPt, H * pxToPt);
    pdf.save(`${graphName}.pdf`);
  };

  // New diagram - clear everything
  const newDiagram = () => {
    setNodes([]);
    setEdges([]);
    setXmlContent('');
    setGraphName(initGraphName);
  };


  // Menu elements for saved graphs
  const savedGraphElements = () => {
    return Object.keys(savedGraphs).length > 0 ? [{
      text: "Saved Graphs:",
      elements: Object.keys(savedGraphs).map(name => ({
        icon: <BiLeftArrowCircle />,
        text: name,
        onClick: () => { 
          loadXML(savedGraphs[name], name); 
          setMenuOpen(false);
        },
      }))
    }] : [];
  };

  const menuElements: Array<ModalMenuElement> = [
    {
      icon: <BiPlus />,
      text: "New Diagram",
      onClick: () => { 
        newDiagram();
        setMenuOpen(false);
      },
    },
    {
      icon: <BiSave />,
      text: "Save Graph",
      onClick: () => { 
        saveGraph(); 
        setMenuOpen(false);
      },
    },
    {
      text: "Open",
      elements: [
        {
          customElement: (
            <StyledFileUpload>
              <FileUpload 
                accept="text/xml" 
                fileCallback={(name, contents) => { 
                  loadXML(contents, name); 
                  setMenuOpen(false); 
                }}
              >
                <div />
                <>Open DCR XML</>
              </FileUpload>
            </StyledFileUpload>
          ),
        },
      ]
    },
    {
      text: "Download",
      elements: [{
        icon: <div />,
        text: "Download Editor XML",
        onClick: () => { 
          downloadXML(); 
          setMenuOpen(false);
        },
      },
      {
        icon: <div />,
        text: "Download PNG",
        onClick: () => {
          downloadPNG();
          setMenuOpen(false);
        },
      },
      {
        icon: <div />,
        text: "Download SVG",
        onClick: () => {
          downloadSVG();
          setMenuOpen(false);
        },
      },
      {
        icon: <div />,
        text: "Download PDF",
        onClick: () => {
          downloadPDF();
          setMenuOpen(false);
        },
      }],
    },
    {
      icon: <BiSolidDashboard />,
      text: "Examples",
      onClick: () => { setMenuOpen(false); setExamplesOpen(true) },
    },
    ...savedGraphElements(),
  ];


  return (
    <>
      <GraphNameInput
        value={graphName}
        onChange={e => setGraphName(e.target.value)}
      />
      
      <div style={{ width: '100vw', height: '100vh', position: 'relative' }}>
        {/* Main ModelerV2 component with loaded data */}
        <ModelerV2 nodes={nodes} edges={edges} nodesRef={nodesRef} edgesRef={edgesRef} onNodeFocus={() => setMenuOpen(false)} />
      </div>

      <TopRightIcons>
        <FullScreenIcon />
        <BiHome onClick={() => { saveGraph(); setState(StateEnum.Home); }} />
        <ModalMenu elements={menuElements} open={menuOpen} setOpen={setMenuOpen} />
      </TopRightIcons>

      {examplesOpen && <Examples
        examplesData={examplesData}
        openCustomXML={(xml, name) => loadXML(xml, name)}
        openDCRXML={(xml, name) => loadXML(xml, name)}
        setExamplesOpen={setExamplesOpen}
        setLoading={() => {}}
      />}
    </>
  );
};

export default ModelerV2State;
